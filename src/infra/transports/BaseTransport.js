import { setTimeout as delay } from "node:timers/promises";

const DEFAULT_BOOTSTRAP_TIMEOUT_MS = 8000;

/**
 * Common voice-target / voice-connection logic shared by Audio and Video transports.
 */
export default class BaseTransport {
	constructor({
		streamer,
		ytdlpService,
		resolveTarget,
		label = "transport",
	}) {
		this.streamer = streamer;
		this.ytdlpService = ytdlpService;
		this.resolveTarget = resolveTarget;
		this.label = label;

		this.activeSessionId = 0;
		this.seekBase = 0;
		this.startedAt = 0;
	}

	getTarget() {
		const target = this.resolveTarget?.() || {};
		const guildId = String(target.guildId || "").trim();
		const voiceChannelId = String(target.voiceChannelId || "").trim();

		if (!guildId || !voiceChannelId) {
			throw new Error(
				"Voice target is not configured. Use `config bot <voiceChannelId> [textChannelId]` first."
			);
		}

		return { guildId, voiceChannelId };
	}

	isSameVoiceConnection(connection, target) {
		if (!connection || !target) {
			return false;
		}
		return (
			String(connection.guildId || "") === String(target.guildId || "") &&
			String(connection.channelId || "") ===
				String(target.voiceChannelId || "")
		);
	}

	safeLeaveVoice() {
		try {
			this.streamer.leaveVoice();
		} catch (error) {
			console.error(`[${this.label}] leave voice error:`, error);
		}
	}

	async ensureVoice({ resetStream = false } = {}) {
		const target = this.getTarget();
		const existing = this.streamer.voiceConnection;

		if (this.isSameVoiceConnection(existing, target)) {
			return existing;
		}

		if (existing) {
			if (resetStream) {
				try {
					this.streamer.stopStream();
				} catch {}
			}
			this.safeLeaveVoice();
			await delay(500);
		}

		console.log(
			`[${this.label}] joining voice...`,
			target.guildId,
			target.voiceChannelId
		);
		await this.streamer.joinVoice(target.guildId, target.voiceChannelId);
		return this.streamer.voiceConnection;
	}

	async getBootstrappedConn(timeoutMs = DEFAULT_BOOTSTRAP_TIMEOUT_MS) {
		const startedAt = Date.now();

		while (Date.now() - startedAt < timeoutMs) {
			const wrapper = this.streamer.voiceConnection?.webRtcConn;
			const params = wrapper?.mediaConnection?.webRtcParams;

			if (wrapper && params) {
				return wrapper;
			}
			await delay(100);
		}

		return null;
	}

	pausedPosition() {
		const elapsed = Math.max(
			0,
			Math.floor((Date.now() - this.startedAt) / 1000)
		);
		return this.seekBase + elapsed;
	}
}
