import path from "node:path";
import { createContext } from "#core/createContext";
import PluginManager from "#core/plugins/PluginManager";

export default class BotApp {
	constructor(config) {
		this.ctx = createContext(config);
		this.pluginManager = new PluginManager(this.ctx);
	}

	async start() {
		await this.ctx.bootstrap();
		await this.pluginManager.loadFrom(
			path.join(process.cwd(), "src", "plugins")
		);
		this.ctx.pluginManager = this.pluginManager;

		this.registerClientEvents();
		this.registerProcessEvents();
		await this.ctx.client.login(this.ctx.token);
	}

	registerClientEvents() {
		const { client } = this.ctx;

		client.on("messageCreate", async (message) => {
			const consumed = await this.pluginManager.dispatchEvent(
				"messageCreate",
				[message]
			);
			if (!consumed) {
				await this.routeCommand(message);
			}
		});

		client.on("channelDelete", (channel) =>
			this.ctx.caches.channels.delete(channel.id)
		);
		client.on("guildDelete", async (guild) => {
			this.ctx.caches.guilds.delete(guild.id);
			this.purgeGuildJoinTimes(guild.id);
			await this.ctx.sessionManager.removeSession(guild.id, {
				destroy: true,
			});
		});

		// Register all other plugin events
		for (const eventName of this.pluginManager.getEventNames()) {
			if (eventName === "messageCreate") {
				continue;
			}
			client.on(eventName, async (...args) => {
				await this.pluginManager.dispatchEvent(eventName, args);
			});
		}
	}

	async routeCommand(message) {
		if (!message?.author?.id) {
			return;
		}
		if (!this.ctx.isTrustedAuthor(message.author.id)) {
			return;
		}

		const parsed = this.ctx.resolveCommandInput(message.content);
		if (!parsed) {
			return;
		}
		if (!this.ctx.isAllowedInConfiguredTextChannel(message)) {
			return;
		}

		const session = this.ctx.getSessionForMessage(message, {
			create: false,
		});
		await this.pluginManager.dispatchCommand({ message, parsed, session });
	}

	purgeGuildJoinTimes(guildId) {
		const prefix = `${guildId}:`;
		for (const key of this.ctx.userJoinTimes.keys()) {
			if (key.startsWith(prefix)) {
				this.ctx.userJoinTimes.delete(key);
			}
		}
	}

	registerProcessEvents() {
		const shutdown = async () => {
			if (this.ctx.runtime.isShuttingDown) {
				return;
			}
			this.ctx.runtime.isShuttingDown = true;
			console.log("Shutting down...");

			for (const session of this.ctx.sessionManager.listSessions()) {
				try {
					await session.destroy();
				} catch (e) {
					console.error("Session destroy error:", e);
				}
			}

			try {
				await this.ctx.client.destroy();
			} catch (e) {
				console.error("Client destroy error:", e);
			}
			process.exit(0);
		};

		process.once("SIGINT", shutdown);
		process.once("SIGTERM", shutdown);
	}
}
