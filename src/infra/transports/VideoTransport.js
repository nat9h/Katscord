import {
	Encoders,
	playStream,
	prepareStream,
	Utils,
} from "@dank074/discord-video-stream";
import BaseTransport from "#infra/transports/BaseTransport";

const QUALITY_PRESETS = {
	low: {
		width: 854,
		height: 480,
		frameRate: 24,
		bitrateVideo: 800,
		bitrateVideoMax: 1200,
		maxHeight: 480,
		maxFps: 30,
	},
	medium: {
		width: 1280,
		height: 720,
		frameRate: 30,
		bitrateVideo: 2500,
		bitrateVideoMax: 3500,
		maxHeight: 720,
		maxFps: 30,
	},
	high: {
		width: 1920,
		height: 1080,
		frameRate: 30,
		bitrateVideo: 4000,
		bitrateVideoMax: 5000,
		maxHeight: 1080,
		maxFps: 30,
	},
};

function normalizeQuality(value) {
	const key = String(value || "auto").toLowerCase();
	if (QUALITY_PRESETS[key]) {
		return key;
	}
	return "auto";
}

export default class VideoTransport extends BaseTransport {
	constructor({ streamer, ytdlpService, resolveTarget }) {
		super({ streamer, ytdlpService, resolveTarget, label: "video" });

		this.currentAbortController = null;
		this.currentYtDlpProcess = null;
		this.currentCommand = null;
	}

	resolveQualityPreset(quality, item) {
		const normalized = normalizeQuality(quality);

		if (normalized !== "auto") {
			return { name: normalized, preset: QUALITY_PRESETS[normalized] };
		}

		const sourceHeight = Number(item?.sourceHeight) || 0;

		if (sourceHeight && sourceHeight <= 480) {
			return { name: "low", preset: QUALITY_PRESETS.low };
		}
		if (sourceHeight && sourceHeight >= 1080) {
			return { name: "high", preset: QUALITY_PRESETS.high };
		}

		return { name: "medium", preset: QUALITY_PRESETS.medium };
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
			this.safeLeaveVoice();
		}
	}

	async pause() {
		const position = this.pausedPosition();
		await this.stop({ keepVoice: true });
		return position;
	}

	buildPrepareInput(item, seekSeconds, preset) {
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
			maxHeight: preset.maxHeight,
			maxFps: preset.maxFps,
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
		{ sessionId, seekSeconds = 0, volume = 1.0, quality = "auto" } = {}
	) {
		this.activeSessionId = sessionId;
		this.seekBase = seekSeconds;
		this.startedAt = Date.now();

		this.cleanupProcesses();
		await this.ensureVoice({ resetStream: true });

		if (sessionId !== this.activeSessionId) {
			return;
		}

		const controller = new AbortController();
		this.currentAbortController = controller;

		const { name: qualityName, preset } = this.resolveQualityPreset(
			quality,
			item
		);
		console.log(
			`[video] quality=${qualityName} ${preset.width}x${preset.height}@${preset.frameRate} ${preset.bitrateVideo}kbps`
		);

		const source = this.buildPrepareInput(item, seekSeconds, preset);
		const safeVolume = Math.max(0, Number(volume) || 1);

		const { command, output } = prepareStream(
			source.input,
			{
				encoder: Encoders.software({
					x264: { preset: "veryfast" },
					x265: { preset: "veryfast" },
				}),
				width: preset.width,
				height: preset.height,
				frameRate: preset.frameRate,
				bitrateVideo: preset.bitrateVideo,
				bitrateVideoMax: preset.bitrateVideoMax,
				bitrateAudio: 128,
				includeAudio: true,
				minimizeLatency: false,
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
