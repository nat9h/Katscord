import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export default class PluginLoader {
	constructor(ctx) {
		this.ctx = ctx;
	}

	async load(rootDir) {
		const commandFiles = await this.walkIfExists(
			path.join(rootDir, "commands")
		);
		const eventFiles = await this.walkIfExists(
			path.join(rootDir, "events")
		);
		const plugins = [];

		for (const file of [...commandFiles, ...eventFiles]) {
			const plugin = await this.loadFile(rootDir, file);
			if (plugin) {
				plugins.push(plugin);
			}
		}

		return plugins;
	}

	resolveInfo(rootDir, file) {
		const absolute = path.isAbsolute(file)
			? path.normalize(file)
			: path.resolve(rootDir, file);
		const relative = path.relative(rootDir, absolute);

		if (
			!relative ||
			relative.startsWith("..") ||
			path.isAbsolute(relative)
		) {
			return null;
		}

		const segments = relative.split(path.sep).filter(Boolean);
		const bucket = segments[0];
		if (!["commands", "events"].includes(bucket)) {
			return null;
		}

		const expectedKind = bucket === "commands" ? "command" : "event";
		const category =
			segments.length > 2
				? segments[1]
				: bucket === "commands"
					? "general"
					: "misc";
		const baseDir = path.join(rootDir, bucket);

		return {
			absolute,
			relativeFromRoot: relative,
			relativeFile: path.relative(baseDir, absolute),
			bucket,
			expectedKind,
			category,
		};
	}

	async loadFile(rootDir, file) {
		const info = this.resolveInfo(rootDir, file);
		if (!info) {
			return null;
		}

		const plugin = await this.importPlugin(info.absolute);
		if (!plugin) {
			return null;
		}

		if (plugin.kind !== info.expectedKind) {
			this.ctx.logger?.warn?.(
				`[PLUGIN SKIPPED] ${info.absolute}: expected '${info.expectedKind}' got '${plugin.kind || "unknown"}'`
			);
			return null;
		}

		plugin.meta = {
			file: info.absolute,
			relativeFromRoot: info.relativeFromRoot,
			relativeFile: info.relativeFile,
			type: info.expectedKind,
			bucket: info.bucket,
			category: info.category,
		};

		return plugin;
	}

	async importPlugin(file) {
		try {
			const url = pathToFileURL(file).href;
			const suffix = this.ctx.dev ? `?update=${Date.now()}` : "";
			const mod = await import(`${url}${suffix}`);
			return mod?.default || null;
		} catch (error) {
			this.ctx.logger?.error?.(`[PLUGIN IMPORT FAILED] ${file}`, error);
			return null;
		}
	}

	async walkIfExists(dir) {
		try {
			return await this.walk(dir);
		} catch {
			return [];
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
			} else if (
				entry.isFile() &&
				entry.name.endsWith(".js") &&
				!entry.name.startsWith("_")
			) {
				files.push(fullPath);
			}
		}

		return files;
	}
}
