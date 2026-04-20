import { spawn } from "node:child_process";

export class MediaProbeService {
	async getDurationSeconds(filePath) {
		return new Promise((resolve) => {
			const child = spawn(
				"ffprobe",
				[
					"-v",
					"error",
					"-show_format",
					"-show_entries",
					"format=duration",
					"-of",
					"json",
					filePath,
				],
				{
					stdio: ["ignore", "pipe", "pipe"],
				}
			);

			let stdout = "";
			let stderr = "";

			child.stdout.on("data", (chunk) => {
				stdout += chunk.toString();
			});

			child.stderr.on("data", (chunk) => {
				stderr += chunk.toString();
			});

			child.on("error", () => resolve(null));

			child.on("close", () => {
				try {
					if (stderr.trim()) {
						console.error(`[ffprobe]: ${stderr.trim()}`);
					}

					const parsed = JSON.parse(stdout || "{}");
					const raw = parsed?.format?.duration;
					const value = Number(raw);

					if (Number.isFinite(value) && value > 0) {
						return resolve(Math.floor(value));
					}

					return resolve(null);
				} catch {
					return resolve(null);
				}
			});
		});
	}
}
