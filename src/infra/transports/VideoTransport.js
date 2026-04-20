import { setTimeout as delay } from "node:timers/promises";
import {
	Encoders,
	playStream,
	prepareStream,
	Utils,
} from "@dank074/discord-video-stream";

export default class VideoTransport {
	constructor({ streamer, client, ytdlpService, resolveTarget }) {
		this.streamer = streamer;
		this.client = client;
		this.ytdlpService = ytdlpService;
		this.resolveTarget = resolveTarget;

		this.currentAbortController = null;
		this.currentYtDlpProcess = null;
		this.currentCommand = null;

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
				this.streamer.stopStream();
			} catch {}

			try {
				this.streamer.leaveVoice();
			} catch {}

			await delay(500);
		}

		console.log(
			"[video] joining voice...",
			target.guildId,
			target.voiceChannelId
		);
		await this.streamer.joinVoice(target.guildId, target.voiceChannelId);

		return this.streamer.voiceConnection;
	}

	getVoiceChannelBitrate() {
		try {
			const { voiceChannelId } = this.getTarget();
			const channel =
				this.client.channels.cache.get(voiceChannelId) || null;
			return channel?.bitrate || 64000;
		} catch {
			return 64000;
		}
	}

	getAdaptiveVideoOptions({ lowMotion = false } = {}) {
		if (lowMotion) {
			return {
				width: 640,
				height: 360,
				frameRate: 12,
				bitrateVideo: 250,
				bitrateVideoMax: 350,
			};
		}

		const channelBitrate = this.getVoiceChannelBitrate();
		const maxVideoBitrate = Math.floor(channelBitrate * 0.8);
		let bitrateVideo = Math.floor(maxVideoBitrate * 0.7);

		bitrateVideo = Math.max(
			300,
			Math.min(Math.floor(bitrateVideo / 1000), 2500)
		);

		if (bitrateVideo < 500) {
			return {
				width: 640,
				height: 360,
				frameRate: 15,
				bitrateVideo,
				bitrateVideoMax: Math.floor(bitrateVideo * 1.2),
			};
		}

		if (bitrateVideo < 1000) {
			return {
				width: 854,
				height: 480,
				frameRate: 24,
				bitrateVideo,
				bitrateVideoMax: Math.floor(bitrateVideo * 1.2),
			};
		}

		return {
			width: 1280,
			height: 720,
			frameRate: 30,
			bitrateVideo,
			bitrateVideoMax: Math.floor(bitrateVideo * 1.2),
		};
	}

	cleanupProcesses() {
		if (this.currentYtDlpProcess) {
			try {
				this.currentYtDlpProcess.kill("SIGTERM");
			} catch {}
			this.currentYtDlpProcess = null;
		}

		if (this.currentCommand) {
			try {
				this.currentCommand.kill("SIGTERM");
			} catch {}
			this.currentCommand = null;
		}

		if (this.currentAbortController) {
			try {
				this.currentAbortController.abort();
			} catch {}
			this.currentAbortController = null;
		}
	}

	async stop({ keepVoice = true } = {}) {
		this.activeSessionId++;
		this.cleanupProcesses();

		try {
			this.streamer.stopStream();
		} catch {}

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

	buildPrepareInput(item, seekSeconds) {
		if (item.source === "local") {
			return {
				input: item.localPath,
				customInputOptions:
					seekSeconds > 0
						? [
								"-ss",
								String(seekSeconds),
								"-thread_queue_size",
								"4096",
							]
						: ["-thread_queue_size", "4096"],
			};
		}

		const ytDlp = this.ytdlpService.createPlaybackProcess(item, {
			mode: "video",
			seekSeconds,
		});

		this.currentYtDlpProcess = ytDlp;

		ytDlp.stderr.on("data", (chunk) => {
			const msg = chunk.toString().trim();
			if (msg && !msg.includes("ffmpeg") && !msg.includes("k/s")) {
				console.error("[yt-dlp/video]", msg);
			}
		});

		return {
			input: ytDlp.stdout,
			customInputOptions: ["-thread_queue_size", "4096"],
		};
	}

	async play(
		item,
		{ sessionId, seekSeconds = 0, volume = 1.0, lowMotion = false } = {}
	) {
		this.activeSessionId = sessionId;
		this.seekBase = seekSeconds;
		this.startedAt = Date.now();

		this.cleanupProcesses();
		await this.ensureVoice();

		if (sessionId !== this.activeSessionId) {
			return;
		}

		const controller = new AbortController();
		this.currentAbortController = controller;

		const adaptive = this.getAdaptiveVideoOptions({ lowMotion });
		const source = this.buildPrepareInput(item, seekSeconds);
		const safeVolume = Math.max(0, Number(volume) || 1);

		const { command, output } = prepareStream(
			source.input,
			{
				encoder: Encoders.software({
					x264: { preset: "veryfast", tune: "zerolatency" },
					x265: { preset: "veryfast", tune: "zerolatency" },
				}),
				width: adaptive.width,
				height: adaptive.height,
				frameRate: adaptive.frameRate,
				bitrateVideo: adaptive.bitrateVideo,
				bitrateVideoMax: adaptive.bitrateVideoMax,
				bitrateAudio: 96,
				includeAudio: true,
				minimizeLatency: true,
				videoCodec: Utils.normalizeVideoCodec("H264"),
				customInputOptions: source.customInputOptions,
				customFfmpegFlags: ["-af", `volume=${safeVolume}`],
			},
			controller.signal
		);

		this.currentCommand = command;

		command.on("error", (err) => {
			console.error("[ffmpeg/video]", err?.message || err);
		});

		try {
			await playStream(
				output,
				this.streamer,
				{ type: "go-live" },
				controller.signal
			);
		} catch (error) {
			if (sessionId === this.activeSessionId) {
				console.error(
					"Video transport error:",
					error?.message || error
				);
			}
		} finally {
			if (this.currentAbortController === controller) {
				this.cleanupProcesses();
			}
		}
	}
}
