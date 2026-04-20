export default class TTLCache {
	constructor(defaultTtlMs = 5 * 60_000) {
		this.defaultTtlMs = defaultTtlMs;
		this.store = new Map();
	}

	set(key, value, ttlMs = this.defaultTtlMs) {
		this.store.set(key, {
			value,
			expiresAt: Date.now() + ttlMs,
		});
		return value;
	}

	get(key) {
		const entry = this.store.get(key);
		if (!entry) {
			return null;
		}

		if (Date.now() >= entry.expiresAt) {
			this.store.delete(key);
			return null;
		}

		return entry.value;
	}

	has(key) {
		return this.get(key) !== null;
	}

	delete(key) {
		return this.store.delete(key);
	}

	clear() {
		this.store.clear();
	}

	async wrap(key, factory, ttlMs = this.defaultTtlMs) {
		const cached = this.get(key);
		if (cached) {
			return cached;
		}

		const value = await factory();
		if (value) {
			this.set(key, value, ttlMs);
		}

		return value;
	}
}
