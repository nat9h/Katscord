import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const clone = (value) => JSON.parse(JSON.stringify(value));

export default class SettingsStore {
	constructor(filePath, defaults = {}) {
		this.filePath = filePath;
		this.defaults = clone(defaults);
		this.data = clone(defaults);
		this.writeQueue = Promise.resolve();
	}

	normalize(data = {}) {
		const merged = {
			...clone(this.defaults),
			...clone(data),
		};

		merged.prefixes = [
			...new Set(
				(Array.isArray(merged.prefixes) ? merged.prefixes : [])
					.map((x) => String(x || "").trim())
					.filter(Boolean)
			),
		];

		if (merged.prefixes.length === 0) {
			merged.prefixes = clone(this.defaults.prefixes || ["!"]);
		}

		merged.ownerIds = [
			...new Set(
				(Array.isArray(merged.ownerIds) ? merged.ownerIds : [])
					.map((x) => String(x || "").trim())
					.filter(Boolean)
			),
		];

		merged.targetGuildId = merged.targetGuildId
			? String(merged.targetGuildId).trim()
			: null;

		merged.targetVoiceChannelId = merged.targetVoiceChannelId
			? String(merged.targetVoiceChannelId).trim()
			: null;

		merged.targetTextChannelId = merged.targetTextChannelId
			? String(merged.targetTextChannelId).trim()
			: null;

		merged.cacheTtlMs = Number(merged.cacheTtlMs) || 5 * 60_000;

		return merged;
	}

	async load() {
		await mkdir(path.dirname(this.filePath), { recursive: true });

		try {
			const raw = await readFile(this.filePath, "utf8");
			this.data = this.normalize(JSON.parse(raw));
		} catch (error) {
			if (error.code !== "ENOENT") {
				throw error;
			}

			this.data = this.normalize(this.defaults);
			await this.flush();
		}

		return this.snapshot();
	}

	snapshot() {
		return clone(this.data);
	}

	get(key, fallback = null) {
		return this.data[key] ?? fallback;
	}

	async set(key, value) {
		return this.update((draft) => {
			draft[key] = value;
		});
	}

	async update(mutator) {
		this.writeQueue = this.writeQueue.then(async () => {
			const draft = this.snapshot();
			await mutator(draft);
			this.data = this.normalize(draft);
			await this.flush();
		});

		return this.writeQueue;
	}

	async flush() {
		await mkdir(path.dirname(this.filePath), { recursive: true });

		const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
		const json = `${JSON.stringify(this.data, null, 2)}\n`;

		await writeFile(tmpPath, json, "utf8");
		await rename(tmpPath, this.filePath);
	}
}
