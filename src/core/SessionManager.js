import GuildSession from "#core/GuildSession";

export default class SessionManager {
	constructor(ctx) {
		this.ctx = ctx;
		this.sessions = new Map();
	}

	loadFromSettings() {
		const targets = this.ctx.settings.get("targets", {});

		for (const [guildId, target] of Object.entries(targets)) {
			if (!guildId || !target?.voiceChannelId) {
				continue;
			}
			this.ensureSession(guildId, target);
		}
	}

	getSession(guildId) {
		if (!guildId) {
			return null;
		}
		return this.sessions.get(String(guildId)) || null;
	}

	listSessions() {
		return [...this.sessions.values()];
	}

	ensureSession(guildId, target = null) {
		const id = String(guildId || "").trim();
		if (!id) {
			return null;
		}

		const existing = this.sessions.get(id);
		if (existing) {
			if (target) {
				existing.setTarget(target);
			}
			return existing;
		}

		const finalTarget = target ||
			this.ctx.getGuildTarget(id) || {
				voiceChannelId: null,
				textChannelId: null,
			};

		const session = new GuildSession({
			ctx: this.ctx,
			guildId: id,
			target: finalTarget,
		});

		this.sessions.set(id, session);
		return session;
	}

	async removeSession(guildId, { destroy = true } = {}) {
		const id = String(guildId || "").trim();
		if (!id) {
			return false;
		}

		const session = this.sessions.get(id);
		if (!session) {
			return false;
		}

		this.sessions.delete(id);

		if (destroy) {
			await session.destroy();
		}

		return true;
	}

	async updateSessionTarget(guildId, target) {
		const session = this.ensureSession(guildId, target);
		session?.setTarget(target);
		return session;
	}
}
