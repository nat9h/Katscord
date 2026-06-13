import { spawn } from "node:child_process";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { setTimeout as delay } from "node:timers/promises";
import { demux } from "@dank074/discord-video-stream";
import BaseTransport from "#infra/transports/BaseTransport";

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

export default class AudioTransport extends BaseTransport {
	constructor({ streamer, ytdlpService, resolveTarget }) {
		super({ streamer, ytdlpService, resolveTarget, label: "audio" });

		this.currentYtDlpProcess = null;
		this.currentFfmpegProcess = null;
		this.currentAudioWritable = null;
	}

	async ensureBootstrappedConn() {
		await this.ensureVoice();

		let conn = await this.getBootstrappedConn(8000);
		if (conn) {
			return conn;
		}

		console.warn("[audio] bootstrap timeout, retrying rejoin once...");
		this.safeLeaveVoice();
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
			this.safeLeaveVoice();
		}
	}

	async pause() {
		const position = this.pausedPosition();
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
			{ stdio: ["pipe", "pipe", "pipe"] }
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
