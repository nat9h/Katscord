import { existsSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AUDIO_EXTENSIONS = new Set([
	".mp3",
	".flac",
	".wav",
	".m4a",
	".aac",
	".ogg",
	".opus",
	".wma",
	".alac",
]);

const VIDEO_EXTENSIONS = new Set([
	".mp4",
	".mkv",
	".avi",
	".mov",
	".webm",
	".m4v",
	".wmv",
	".ts",
	".mts",
	".m2ts",
]);

function stripQuotes(value) {
	if (!value) return value;

	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		return value.slice(1, -1).trim();
	}

	return value;
}

export function normalizeLocalPath(input) {
	if (!input || typeof input !== "string") return null;

	let value = stripQuotes(input.trim());

	try {
		if (value.startsWith("file://")) {
			return fileURLToPath(value);
		}
	} catch {
		return null;
	}

	return path.resolve(value);
}

export function getLocalPathType(input) {
	const resolved = normalizeLocalPath(input);
	if (!resolved) return null;

	try {
		if (!existsSync(resolved)) return null;

		const stats = statSync(resolved);
		if (stats.isFile()) return "file";
		if (stats.isDirectory()) return "directory";
		return null;
	} catch {
		return null;
	}
}

export function isLocalFile(input) {
	return getLocalPathType(input) === "file";
}

export function isLocalDirectory(input) {
	return getLocalPathType(input) === "directory";
}

export function isPlayableMediaFile(filePath) {
	const ext = path.extname(filePath).toLowerCase();
	return AUDIO_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext);
}

export function inferLocalMode(filePath) {
	const ext = path.extname(filePath).toLowerCase();
	if (AUDIO_EXTENSIONS.has(ext)) return "audio";
	return "video";
}

export async function listPlayableFilesInDirectory(
	dirPath,
	{ recursive = false } = {}
) {
	const entries = await readdir(dirPath, { withFileTypes: true });
	const files = [];

	for (const entry of entries) {
		const fullPath = path.join(dirPath, entry.name);

		if (entry.isDirectory()) {
			if (recursive) {
				files.push(
					...(await listPlayableFilesInDirectory(fullPath, {
						recursive,
					}))
				);
			}
			continue;
		}

		if (entry.isFile() && isPlayableMediaFile(fullPath)) {
			files.push(fullPath);
		}
	}

	files.sort((a, b) =>
		a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
	);
	return files;
}

export async function buildLocalQueueItem(
	input,
	forcedMode = null,
	mediaProbeService = null
) {
	const localPath = normalizeLocalPath(input);
	if (!localPath) {
		throw new Error("Invalid local file path.");
	}

	const mode = forcedMode || inferLocalMode(localPath);
	const duration = mediaProbeService
		? await mediaProbeService.getDurationSeconds(localPath)
		: null;

	return {
		source: "local",
		mode,
		title: path.basename(localPath),
		artist: "",
		duration,
		thumbnail: "",
		originalInput: localPath,
		localPath,
	};
}

export async function buildLocalQueueItemsFromDirectory(
	input,
	forcedMode = null,
	mediaProbeService = null,
	{ recursive = false } = {}
) {
	const dirPath = normalizeLocalPath(input);
	if (!dirPath) {
		throw new Error("Invalid local directory path.");
	}

	const files = await listPlayableFilesInDirectory(dirPath, { recursive });

	const items = [];
	for (const filePath of files) {
		const item = await buildLocalQueueItem(
			filePath,
			forcedMode,
			mediaProbeService
		);
		items.push(item);
	}

	return items;
}
