import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export default class PluginManager {
	constructor(ctx) {
		this.ctx = ctx;
		this.reset();
	}

	reset() {
		this.commands = new Map();
		this.aliases = new Map();
		this.events = new Map();
		this.loadedFiles = [];
	}

	async loadFrom(rootDir, { reset = true } = {}) {
		if (reset) {
			this.reset();
		}

		const files = await this.walk(rootDir);

		for (const file of files) {
			const plugin = await this.importPlugin(file);
			if (!plugin || !plugin.kind || !plugin.name) {
				continue;
			}

			const relativeFile = path.relative(rootDir, file);
			const segments = relativeFile.split(path.sep);
			const folderName = segments.length > 1 ? segments[0] : "misc";

			plugin.__file = file;
			plugin.__relativeFile = relativeFile;
			plugin.__folder = folderName;

			this.loadedFiles.push(file);

			if (plugin.kind === "command") {
				this.registerCommand(plugin);
			}

			if (plugin.kind === "event") {
				this.registerEvent(plugin);
			}
		}

		for (const [eventName, handlers] of this.events.entries()) {
			handlers.sort((a, b) => (b.priority || 0) - (a.priority || 0));
			this.events.set(eventName, handlers);
		}
	}

	async importPlugin(file) {
		const url = pathToFileURL(file).href;
		const mod = await import(`${url}?update=${Date.now()}`);
		return mod?.default || null;
	}

	normalizeName(name) {
		return String(name || "")
			.trim()
			.toLowerCase();
	}

	registerCommand(plugin) {
		const commandName = this.normalizeName(plugin.name);
		if (!commandName) {
			return;
		}

		if (this.commands.has(commandName)) {
			throw new Error(`Duplicate command detected: ${commandName}`);
		}

		this.commands.set(commandName, plugin);

		for (const alias of plugin.aliases || []) {
			const normalizedAlias = this.normalizeName(alias);
			if (!normalizedAlias) {
				continue;
			}

			if (
				this.aliases.has(normalizedAlias) ||
				this.commands.has(normalizedAlias)
			) {
				throw new Error(
					`Duplicate command alias detected: ${normalizedAlias}`
				);
			}

			this.aliases.set(normalizedAlias, commandName);
		}
	}

	registerEvent(plugin) {
		const eventName = String(plugin.name || "").trim();
		if (!eventName) {
			return;
		}

		if (!this.events.has(eventName)) {
			this.events.set(eventName, []);
		}

		this.events.get(eventName).push(plugin);
	}

	resolveCommand(name) {
		const normalized = this.normalizeName(name);
		const actual = this.aliases.get(normalized) || normalized;
		return this.commands.get(actual) || null;
	}

	getEventNames() {
		return [...this.events.keys()];
	}

	getHandlers(eventName) {
		return this.events.get(eventName) || [];
	}

	getHelpCommands() {
		return [...this.commands.values()]
			.filter((command) => command.help?.hidden !== true)
			.sort((a, b) => {
				const groupA = String(
					a.help?.group || a.__folder || ""
				).toLowerCase();
				const groupB = String(
					b.help?.group || b.__folder || ""
				).toLowerCase();

				if (groupA !== groupB) {
					return groupA.localeCompare(groupB);
				}

				return String(a.name).localeCompare(String(b.name));
			});
	}

	async dispatchCommand({ message, parsed, session = null }) {
		const command = this.resolveCommand(parsed?.commandName);
		if (!command) {
			return false;
		}

		return this.executePlugin(command, {
			ctx: this.ctx,
			message,
			api: this.ctx.api,
			args: parsed?.args || [],
			command: command.name,
			commandName: parsed?.commandName || command.name,
			usedPrefix: parsed?.usedPrefix || "!",
			rawInput: parsed?.rawInput || "",
			session,
			pluginManager: this,
			respond: this.ctx.respond,
			services: this.ctx.services,
		});
	}

	async dispatchEvent(eventName, args = []) {
		const handlers = this.getHandlers(eventName);

		for (const handler of handlers) {
			const consumed = await this.executePlugin(
				handler,
				{
					ctx: this.ctx,
					api: this.ctx.api,
					args,
					pluginManager: this,
					respond: this.ctx.respond,
					services: this.ctx.services,
				},
				{
					typeLabel: `EVENT:${eventName}`,
					replyMessage: null,
				}
			);

			if (consumed === true) {
				return true;
			}
		}

		return false;
	}

	async executePlugin(
		plugin,
		payload,
		{ typeLabel = null, replyMessage = undefined } = {}
	) {
		try {
			return await plugin.execute(payload);
		} catch (error) {
			const label =
				typeLabel ||
				`${String(plugin.kind || "plugin").toUpperCase()}:${plugin.name}`;

			this.ctx.logger?.error?.(`[PLUGIN ${label}]`, error);

			const targetMessage =
				replyMessage === undefined ? payload?.message : replyMessage;

			if (targetMessage) {
				const failedTemplate =
					plugin?.failed || "Failed to execute %command: %error";

				const text = String(failedTemplate)
					.replace(/%command/g, plugin?.name || "unknown")
					.replace(/%error/g, error?.message || "Unknown error");

				await this.ctx.respond.reply(targetMessage, text, {
					preferReply: true,
				});
			}

			return false;
		}
	}

	async walk(dir) {
		const entries = await readdir(dir, { withFileTypes: true });
		entries.sort((a, b) => a.name.localeCompare(b.name));

		const files = [];

		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);

			if (entry.isDirectory()) {
				files.push(...(await this.walk(fullPath)));
				continue;
			}

			if (entry.isFile() && entry.name.endsWith(".js")) {
				files.push(fullPath);
			}
		}

		return files;
	}
}
