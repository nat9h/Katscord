export default class CooldownManager {
	constructor() {
		this.store = new Map();
	}

	getNow() {
		return Date.now();
	}

	getScopeKey(plugin, payload, scope = "user") {
		const message = payload?.message;

		switch (scope) {
			case "global":
				return `${plugin.name}:global`;

			case "channel":
				return `${plugin.name}:channel:${message?.channel?.id || "unknown"}`;

			case "guild":
				return `${plugin.name}:guild:${
					message?.guild?.id ||
					`dm:${message?.channel?.id || "unknown"}`
				}`;

			case "user":
			default:
				return `${plugin.name}:user:${message?.author?.id || "unknown"}`;
		}
	}

	getRemainingMs(plugin, payload) {
		const seconds = Number(plugin?.cooldown?.seconds || 0);
		if (seconds <= 0) {
			return 0;
		}

		const scope = plugin?.cooldown?.scope || "user";
		const key = this.getScopeKey(plugin, payload, scope);
		const expiresAt = this.store.get(key) || 0;
		const remaining = expiresAt - this.getNow();

		if (remaining <= 0) {
			this.store.delete(key);
			return 0;
		}

		return remaining;
	}

	consume(plugin, payload) {
		const seconds = Number(plugin?.cooldown?.seconds || 0);
		if (seconds <= 0) {
			return;
		}

		const scope = plugin?.cooldown?.scope || "user";
		const key = this.getScopeKey(plugin, payload, scope);
		this.store.set(key, this.getNow() + seconds * 1000);
	}

	clearExpired() {
		const now = this.getNow();

		for (const [key, expiresAt] of this.store.entries()) {
			if (expiresAt <= now) {
				this.store.delete(key);
			}
		}
	}
}
