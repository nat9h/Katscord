export default class PluginRegistry {
	constructor() {
		this.reset();
	}

	reset() {
		this.commands = new Map();
		this.aliases = new Map();
		this.events = new Map();
		this.files = new Map();
	}

	get loadedFiles() {
		return [...this.files.keys()];
	}

	normalizeName(name) {
		return String(name || "")
			.trim()
			.toLowerCase();
	}

	register(plugin) {
		if (!plugin?.meta?.file) {
			throw new Error("Plugin metadata is missing file path.");
		}

		if (plugin.kind === "command") {
			this.registerCommand(plugin);
		} else if (plugin.kind === "event") {
			this.registerEvent(plugin);
		}

		this.files.set(plugin.meta.file, plugin);
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

	unregisterByFile(file) {
		const plugin = this.files.get(file);
		if (!plugin) {
			return null;
		}

		if (plugin.kind === "command") {
			const commandName = this.normalizeName(plugin.name);
			this.commands.delete(commandName);

			for (const [alias, actual] of this.aliases.entries()) {
				if (actual === commandName) {
					this.aliases.delete(alias);
				}
			}
		}

		if (plugin.kind === "event") {
			const eventName = String(plugin.name || "").trim();
			const handlers = this.events.get(eventName) || [];
			const nextHandlers = handlers.filter(
				(item) => item.meta?.file !== file
			);

			if (nextHandlers.length > 0) {
				this.events.set(eventName, nextHandlers);
			} else {
				this.events.delete(eventName);
			}
		}

		this.files.delete(file);
		return plugin;
	}

	getByFile(file) {
		return this.files.get(file) || null;
	}

	finalize() {
		for (const [eventName, handlers] of this.events.entries()) {
			handlers.sort((a, b) => (b.priority || 0) - (a.priority || 0));
			this.events.set(eventName, handlers);
		}
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

	resolveCategory(command) {
		return (
			command.category ||
			command.help?.group ||
			command.meta?.category ||
			"general"
		);
	}

	getAllCommands({ visibleOnly = true } = {}) {
		const commands = [...this.commands.values()];

		if (!visibleOnly) {
			return commands;
		}

		return commands.filter((command) => command.help?.hidden !== true);
	}

	getHelpCommands() {
		return [...this.commands.values()]
			.filter((command) => command.help?.hidden !== true)
			.sort((a, b) => {
				const categoryA = this.resolveCategory(a).toLowerCase();
				const categoryB = this.resolveCategory(b).toLowerCase();

				if (categoryA !== categoryB) {
					return categoryA.localeCompare(categoryB);
				}

				return String(a.name).localeCompare(String(b.name));
			});
	}

	getCommandCategories({ visibleOnly = true } = {}) {
		const groups = new Map();

		for (const command of this.commands.values()) {
			if (visibleOnly && command.help?.hidden === true) {
				continue;
			}

			const category = this.resolveCategory(command);

			if (!groups.has(category)) {
				groups.set(category, []);
			}

			groups.get(category).push(command);
		}

		return [...groups.entries()]
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([name, commands]) => ({
				name,
				commands: commands.sort((a, b) =>
					String(a.name).localeCompare(String(b.name))
				),
			}));
	}
}
