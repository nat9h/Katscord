import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import TTLCache from "#core/TTLCache";

export class YtdlpService {
	constructor({ cookiesPath = "./cookies.txt" } = {}) {
		this.cookiesPath = cookiesPath;

		this.searchCache = new TTLCache(10 * 60_000);
		this.videoInfoCache = new TTLCache(30 * 60_000);
		this.playlistCache = new TTLCache(15 * 60_000);
	}

	getBaseArgs() {
		const args = ["--no-warnings", "--js-runtimes", "deno"];

		if (existsSync(this.cookiesPath)) {
			args.push("--cookies", this.cookiesPath);
		}

		return args;
	}

	run(args, { jsonLines = false } = {}) {
		return new Promise((resolve, reject) => {
			const child = spawn("yt-dlp", args, {
				stdio: ["ignore", "pipe", "pipe"],
			});

			let stdout = "";
			let stderr = "";

			child.stdout.on("data", (chunk) => {
				stdout += chunk.toString();
			});

			child.stderr.on("data", (chunk) => {
				stderr += chunk.toString();
			});

			child.on("error", (error) => {
				reject(error);
			});

			child.on("close", (code) => {
				if (code !== 0) {
					return reject(
						new Error(
							stderr.trim() || `yt-dlp exited with code ${code}`
						)
					);
				}

				try {
					if (jsonLines) {
						const items = stdout
							.trim()
							.split("\n")
							.filter(Boolean)
							.map((line) => JSON.parse(line));

						return resolve(items);
					}

					const trimmed = stdout.trim();
					return resolve(trimmed ? JSON.parse(trimmed) : null);
				} catch (error) {
					reject(error);
				}
			});
		});
	}

	buildYouTubeUrl(entry) {
		if (entry?.url?.startsWith?.("http")) {
			return entry.url;
		}

		if (entry?.id) {
			return `https://www.youtube.com/watch?v=${entry.id}`;
		}

		if (entry?.url) {
			return `https://www.youtube.com/watch?v=${entry.url}`;
		}

		return null;
	}

	async search(query, limit = 8) {
		const normalizedQuery = String(query || "").trim();
		const safeLimit = Math.max(1, Math.min(20, Number(limit) || 8));

		if (!normalizedQuery) {
			return [];
		}

		const cacheKey = `ytdlp:search:${normalizedQuery.toLowerCase()}:${safeLimit}`;

		return this.searchCache.wrap(cacheKey, async () => {
			const entries = await this.run(
				[
					...this.getBaseArgs(),
					"--flat-playlist",
					"--dump-json",
					`ytsearch${safeLimit}:${normalizedQuery}`,
				],
				{ jsonLines: true }
			);

			return entries
				.map((entry) => ({
					title: `${entry.title} - ${entry.uploader || entry.channel || "Unknown"}`,
					original_url: this.buildYouTubeUrl(entry),
					duration: entry.duration || null,
					thumbnail: entry.thumbnail || "",
				}))
				.filter((item) => item.original_url);
		});
	}

	async getVideoInfo(url) {
		const normalizedUrl = String(url || "").trim();
		if (!normalizedUrl) {
			throw new Error("Video URL is required.");
		}

		const cacheKey = `ytdlp:video:${normalizedUrl}`;

		return this.videoInfoCache.wrap(cacheKey, async () => {
			const info = await this.run([
				...this.getBaseArgs(),
				"--dump-json",
				"--no-playlist",
				normalizedUrl,
			]);

			return {
				title: info?.title || "Unknown Title",
				duration: info?.duration || null,
				thumbnail: info?.thumbnail || "",
			};
		});
	}

	async getPlaylistInfo(url) {
		const normalizedUrl = String(url || "").trim();
		if (!normalizedUrl) {
			throw new Error("Playlist URL is required.");
		}

		const cacheKey = `ytdlp:playlist:${normalizedUrl}`;

		return this.playlistCache.wrap(cacheKey, async () => {
			const entries = await this.run(
				[
					...this.getBaseArgs(),
					"--flat-playlist",
					"--dump-json",
					normalizedUrl,
				],
				{ jsonLines: true }
			);

			return entries
				.map((entry) => ({
					title: entry.title,
					url: this.buildYouTubeUrl(entry),
					duration: entry.duration || null,
					thumbnail: entry.thumbnail || "",
				}))
				.filter((item) => item.url);
		});
	}

	resolvePlaybackInput(item) {
		return (
			item?.originalInput ||
			item?.original_url ||
			item?.url ||
			(item?.youtubeQuery ? `ytsearch1:${item.youtubeQuery}` : null)
		);
	}

	createPlaybackProcess(item, { mode = "audio", seekSeconds = 0 } = {}) {
		const input = this.resolvePlaybackInput(item);

		if (!input) {
			throw new Error("No playable input found for yt-dlp.");
		}

		const format =
			mode === "video"
				? "bv*[ext=mp4][height<=720][fps<=30]+ba/b"
				: "ba/best";

		const args = [
			...this.getBaseArgs(),
			"--quiet",
			"--no-playlist",
			"-o",
			"-",
			"-f",
			format,
			"--rm-cache-dir",
		];

		if (seekSeconds > 0) {
			args.push("--download-sections", `*${seekSeconds}-`);

			if (mode === "video") {
				args.push("--force-keyframes-at-cuts");
			}
		}

		args.push(input);

		console.log("[yt-dlp spawn]", ["yt-dlp", ...args].join(" "));

		return spawn("yt-dlp", args, {
			stdio: ["ignore", "pipe", "pipe"],
		});
	}
}
