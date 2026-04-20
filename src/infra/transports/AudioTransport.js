import { spawn } from "node:child_process";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { setTimeout as delay } from "node:timers/promises";
import { demux } from "@dank074/discord-video-stream";

class OpusAudioWritable extends Writable {
	constructor(conn) {
		super({ objectMode: true, highWaterMark: 1 });
		this.conn = conn;
		this.startTime = undefined;
		this.startPts = undefined;
		this.lastPts = 0;
	}

	_destroy(error, callback) {
		callback(error);
	}

	async _write(packet, _, callback) {
		try {
			const data = packet?.data;

			if (!data) {
				packet?.free?.();
				callback();
				return;
			}

			const tbNum = Number(packet?.timeBase?.num);
			const tbDen = Number(packet?.timeBase?.den);
			const rawDuration = Number(packet?.duration);
			const rawPts = Number(packet?.pts);

			const hasTimeBase =
				Number.isFinite(tbNum) &&
				tbNum > 0 &&
				Number.isFinite(tbDen) &&
				tbDen > 0;

			const frameTime =
				hasTimeBase && Number.isFinite(rawDuration) && rawDuration > 0
					? (rawDuration * tbNum * 1000) / tbDen
					: 20;

			const ptsMs =
				hasTimeBase && Number.isFinite(rawPts)
					? (rawPts * tbNum * 1000) / tbDen
					: this.lastPts + frameTime;

			this.conn.sendAudioFrame(Buffer.from(data), frameTime);

			this.lastPts = ptsMs;
			this.startTime ??= performance.now();
			this.startPts ??= ptsMs;

			const elapsed = performance.now() - this.startTime;
			const target = ptsMs - this.startPts + frameTime;
			const sleep = Math.max(0, target - elapsed);

			packet?.free?.();

			if (sleep > 0) {
				await delay(sleep);
			}

			callback();
		} catch (error) {
			packet?.free?.();
			callback(error);
		}
	}
}

export default class AudioTransport {
	constructor({ streamer, client, ytdlpService, resolveTarget }) {
		this.streamer = streamer;
		this.client = client;
		this.ytdlpService = ytdlpService;
		this.resolveTarget = resolveTarget;

		this.currentYtDlpProcess = null;
		this.currentFfmpegProcess = null;
		this.currentAudioWritable = null;

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

	async ensureVoice() {
		const target = this.getTarget();
		const existing = this.streamer.voiceConnection;

		if (this.isSameVoiceConnection(existing, target)) {
			return existing;
		}

		if (existing) {
			try {
				this.streamer.leaveVoice();
			} catch (error) {
				console.error("Leave voice error:", error);
			}
			await delay(500);
		}

		console.log(
			"[audio] joining voice...",
			target.guildId,
			target.voiceChannelId
		);
		await this.streamer.joinVoice(target.guildId, target.voiceChannelId);

		return this.streamer.voiceConnection;
	}

	async getBootstrappedConn(timeoutMs = 15000) {
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

	async ensureBootstrappedConn() {
		await this.ensureVoice();

		let conn = await this.getBootstrappedConn(8000);
		if (conn) {
			return conn;
		}

		console.warn("[audio] bootstrap timeout, retrying rejoin once...");

		try {
			this.streamer.leaveVoice();
		} catch {}

		await delay(1000);
		await this.ensureVoice();

		conn = await this.getBootstrappedConn(10000);
		if (conn) {
			return conn;
		}

		throw new Error("Voice bootstrap failed: webRtcParams not received.");
	}

	cleanupProcesses() {
		if (this.currentAudioWritable) {
			try {
				this.currentAudioWritable.destroy();
			} catch {}
			this.currentAudioWritable = null;
		}

		if (this.currentFfmpegProcess) {
			try {
				this.currentFfmpegProcess.kill("SIGTERM");
			} catch {}
			this.currentFfmpegProcess = null;
		}

		if (this.currentYtDlpProcess) {
			try {
				this.currentYtDlpProcess.kill("SIGTERM");
			} catch {}
			this.currentYtDlpProcess = null;
		}
	}

	async stop({ keepVoice = true } = {}) {
		this.activeSessionId++;
		this.cleanupProcesses();

		const voiceConn = this.streamer.voiceConnection;
		if (voiceConn?.webRtcConn?.mediaConnection) {
			try {
				voiceConn.webRtcConn.mediaConnection.setSpeaking(false);
				voiceConn.webRtcConn.mediaConnection.setVideoAttributes(false);
				this.streamer.signalVideo(false);
			} catch {}
		}

		if (!keepVoice) {
			try {
				this.streamer.leaveVoice();
			} catch {}
		}
	}

	async pause() {
		const elapsed = Math.max(
			0,
			Math.floor((Date.now() - this.startedAt) / 1000)
		);

		const position = this.seekBase + elapsed;
		await this.stop({ keepVoice: true });
		return position;
	}

	async play(item, { sessionId, seekSeconds = 0, volume = 1.0 } = {}) {
		this.activeSessionId = sessionId;
		this.seekBase = seekSeconds;
		this.startedAt = Date.now();

		this.cleanupProcesses();

		const conn = await this.ensureBootstrappedConn();

		if (sessionId !== this.activeSessionId) {
			return;
		}

		conn.setPacketizer("H264");
		conn.mediaConnection.setSpeaking(true);
		conn.mediaConnection.setVideoAttributes(false);
		this.streamer.signalVideo(false);

		await delay(1000);

		const ytDlp = this.ytdlpService.createPlaybackProcess(item, {
			mode: "audio",
			seekSeconds,
		});

		this.currentYtDlpProcess = ytDlp;

		const safeVolume = Math.max(0, Number(volume) || 1);

		const ffmpeg = spawn(
			"ffmpeg",
			[
				"-hide_banner",
				"-loglevel",
				"error",
				"-i",
				"pipe:0",
				"-map",
				"0:a:0?",
				"-vn",
				"-sn",
				"-dn",
				"-ac",
				"2",
				"-ar",
				"48000",
				"-c:a",
				"libopus",
				"-b:a",
				"128k",
				"-af",
				`volume=${safeVolume}`,
				"-f",
				"matroska",
				"pipe:1",
			],
			{
				stdio: ["pipe", "pipe", "pipe"],
			}
		);

		this.currentFfmpegProcess = ffmpeg;
		ytDlp.stdout.pipe(ffmpeg.stdin);

		ytDlp.stderr.on("data", (chunk) => {
			const msg = chunk.toString().trim();
			if (msg) {
				console.error("[yt-dlp/audio]", msg);
			}
		});

		ffmpeg.stderr.on("data", (chunk) => {
			const msg = chunk.toString().trim();
			if (msg) {
				console.error("[ffmpeg/audio]", msg);
			}
		});

		ffmpeg.stdin.on("error", () => {});
		ytDlp.stdout.on("error", () => {});

		try {
			const media = await demux(ffmpeg.stdout, { format: "matroska" });

			if (!media.audio) {
				throw new Error("No audio stream found for audio playback.");
			}

			if (sessionId !== this.activeSessionId) {
				return;
			}

			const writable = new OpusAudioWritable(conn);
			this.currentAudioWritable = writable;

			await pipeline(media.audio.stream, writable);
		} catch (error) {
			if (sessionId === this.activeSessionId) {
				console.error(
					"Audio transport error:",
					error?.message || error
				);
			}
		} finally {
			try {
				conn.mediaConnection.setSpeaking(false);
				conn.mediaConnection.setVideoAttributes(false);
				this.streamer.signalVideo(false);
			} catch {}

			this.cleanupProcesses();
		}
	}
}
