import {
	access,
	mkdir,
	readdir,
	readFile,
	rename as renameFile,
	rm,
	writeFile,
} from "node:fs/promises";
import path from "node:path";

const PLAYLIST_DIR = path.join(process.cwd(), "data", "playlists");

function sanitizeName(name) {
	return String(name || "")
		.trim()
		.replace(/[^\w.-]+/g, "_");
}

function assertPlaylistName(name) {
	const safeName = sanitizeName(name);

	if (!safeName) {
		throw new Error("Playlist name is required.");
	}

	return safeName;
}

async function ensureDir() {
	await mkdir(PLAYLIST_DIR, { recursive: true });
}

function playlistPath(name) {
	return path.join(PLAYLIST_DIR, `${assertPlaylistName(name)}.json`);
}

async function exists(filePath) {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function readJson(filePath) {
	const raw = await readFile(filePath, "utf8");
	return JSON.parse(raw);
}

async function writeJsonAtomic(filePath, data) {
	const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

	await writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
	await renameFile(tmpPath, filePath);
}

function createPlaylistPayload(name, items = [], metadata = {}) {
	return {
		name,
		createdAt: metadata.createdAt || new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		items: Array.isArray(items) ? items : [],
	};
}

export async function savePlaylist(name, items, metadata = {}) {
	await ensureDir();

	const safeName = assertPlaylistName(name);
	const filePath = playlistPath(safeName);

	const payload = createPlaylistPayload(safeName, items, metadata);

	await writeJsonAtomic(filePath, payload);

	return filePath;
}

export async function loadPlaylist(name) {
	await ensureDir();

	const safeName = assertPlaylistName(name);
	const filePath = playlistPath(safeName);

	if (!(await exists(filePath))) {
		return null;
	}

	return readJson(filePath);
}

export async function listPlaylists() {
	await ensureDir();

	const entries = await readdir(PLAYLIST_DIR);

	return entries
		.filter((name) => name.endsWith(".json"))
		.map((name) => name.replace(/\.json$/i, ""))
		.sort((a, b) => a.localeCompare(b));
}

export async function deletePlaylist(name) {
	await ensureDir();

	const safeName = assertPlaylistName(name);
	const filePath = playlistPath(safeName);

	if (!(await exists(filePath))) {
		return false;
	}

	await rm(filePath, { force: true });
	return true;
}

export async function renamePlaylist(oldName, newName) {
	await ensureDir();

	const oldSafeName = assertPlaylistName(oldName);
	const newSafeName = assertPlaylistName(newName);

	const oldPath = playlistPath(oldSafeName);
	const newPath = playlistPath(newSafeName);

	if (!(await exists(oldPath))) {
		return { ok: false, reason: "not_found" };
	}

	if (await exists(newPath)) {
		return { ok: false, reason: "target_exists" };
	}

	const data = await readJson(oldPath);

	await renameFile(oldPath, newPath);

	const updatedPayload = {
		...data,
		name: newSafeName,
		updatedAt: new Date().toISOString(),
	};

	await writeJsonAtomic(newPath, updatedPayload);

	return {
		ok: true,
		oldName: oldSafeName,
		newName: newSafeName,
	};
}
