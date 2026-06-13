import path from "node:path";
import PluginExecutor from "#core/plugins/PluginExecutor";
import PluginLoader from "#core/plugins/PluginLoader";
import PluginRegistry from "#core/plugins/PluginRegistry";
import PluginValidator from "#core/plugins/PluginValidator";

export default class PluginManager {
	constructor(ctx) {
		this.ctx = ctx;
		this.rootDir = null;
		this.loader = new PluginLoader(ctx);
		this.registry = new PluginRegistry();
		this.validator = new PluginValidator();
		this.executor = new PluginExecutor(ctx);
	}

	get loadedFiles() {
		return this.registry.loadedFiles;
	}

	async loadFrom(rootDir, { reset = true } = {}) {
		this.rootDir = path.resolve(rootDir);
		if (reset) {
			this.registry.reset();
		}

		const plugins = await this.loader.load(this.rootDir);

		for (const plugin of plugins) {
			const errors = this.validator.validate(plugin);
			if (errors.length > 0) {
				this.ctx.logger?.warn?.(
					`[PLUGIN INVALID] ${plugin?.meta?.file || "unknown"}\n- ${errors.join("\n- ")}`
				);
				continue;
			}
			this.registry.register(plugin);
		}

		this.registry.finalize();
	}

	resolveCommand(name) {
		return this.registry.resolveCommand(name);
	}
	getEventNames() {
		return this.registry.getEventNames();
	}
	getHandlers(eventName) {
		return this.registry.getHandlers(eventName);
	}
	getHelpCommands() {
		return this.registry.getHelpCommands();
	}
	getCommandCategories(options = {}) {
		return this.registry.getCommandCategories(options);
	}

	getAllCommands({ visibleOnly = true } = {}) {
		const commands = [...this.registry.commands.values()];
		return visibleOnly
			? commands.filter((c) => c.help?.hidden !== true)
			: commands;
	}

	async reloadPlugin(file) {
		if (!this.rootDir) {
			throw new Error("PluginManager not initialized.");
		}

		const nextPlugin = await this.loader.loadFile(this.rootDir, file);
		if (!nextPlugin) {
			throw new Error(`Unable to load: ${file}`);
		}

		const errors = this.validator.validate(nextPlugin);
		if (errors.length > 0) {
			throw new Error(`Validation failed:\n- ${errors.join("\n- ")}`);
		}

		const prev = this.registry.getByFile(nextPlugin.meta.file);
		if (prev) {
			this.registry.unregisterByFile(nextPlugin.meta.file);
		}

		this.registry.register(nextPlugin);
		this.registry.finalize();

		return {
			file: nextPlugin.meta.file,
			kind: nextPlugin.kind,
			name: nextPlugin.name,
			replaced: Boolean(prev),
		};
	}

	async dispatchCommand({ message, parsed, session = null }) {
		const command = this.resolveCommand(parsed?.commandName);
		if (!command) {
			return false;
		}
		return this.executor.runCommand(command, {
			message,
			parsed,
			session,
			pluginManager: this,
		});
	}

	async dispatchEvent(eventName, args = []) {
		const handlers = this.getHandlers(eventName);
		for (const handler of handlers) {
			const consumed = await this.executor.runEvent(handler, {
				args,
				pluginManager: this,
			});
			if (consumed === true) {
				return true;
			}
		}
		return false;
	}
}
