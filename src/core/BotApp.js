import path from "node:path";
import { createContext } from "#core/createContext";
import PluginManager from "#core/PluginManager";

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
		this.ctx.client.on("messageCreate", async (message) => {
			const consumed = await this.pluginManager.dispatchEvent(
				"messageCreate",
				[message]
			);

			if (consumed) {
				return;
			}

			await this.routeCommand(message);
		});

		this.ctx.client.on("channelDelete", (channel) => {
			this.ctx.caches.channels.delete(channel.id);
		});

		this.ctx.client.on("guildDelete", async (guild) => {
			this.ctx.caches.guilds.delete(guild.id);
			await this.ctx.sessionManager.removeSession(guild.id, {
				destroy: true,
			});
		});

		const eventNames = this.pluginManager
			.getEventNames()
			.filter((name) => name !== "messageCreate");

		for (const eventName of eventNames) {
			this.ctx.client.on(eventName, async (...args) => {
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

		this.ctx.runtime.lastCommandChannelId = message.channel.id;
		this.ctx.runtime.lastUsedPrefix = parsed.usedPrefix;

		const session = this.ctx.getSessionForMessage(message, {
			create: false,
		});

		await this.pluginManager.dispatchCommand({
			message,
			parsed,
			session,
		});
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
				} catch (error) {
					console.error(
						"Failed to destroy session during shutdown:",
						error
					);
				}
			}

			try {
				await this.ctx.client.destroy();
			} catch (error) {
				console.error(
					"Failed to destroy session during shutdown:",
					error
				);
			}

			process.exit(0);
		};

		process.once("SIGINT", shutdown);
		process.once("SIGTERM", shutdown);
	}
}
