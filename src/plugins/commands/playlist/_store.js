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

function assertName(name) {
	const safe = sanitizeName(name);
	if (!safe) {
		throw new Error("Playlist name is required.");
	}
	return safe;
}

async function ensureDir() {
	await mkdir(PLAYLIST_DIR, { recursive: true });
}

function filePath(name) {
	return path.join(PLAYLIST_DIR, `${assertName(name)}.json`);
}

async function exists(fp) {
	try {
		await access(fp);
		return true;
	} catch {
		return false;
	}
}

async function readJson(fp) {
	return JSON.parse(await readFile(fp, "utf8"));
}

async function writeJsonAtomic(fp, data) {
	const tmp = `${fp}.${process.pid}.${Date.now()}.tmp`;
	await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
	await renameFile(tmp, fp);
}

export async function savePlaylist(name, items, metadata = {}) {
	await ensureDir();
	const safe = assertName(name);
	const fp = filePath(safe);
	await writeJsonAtomic(fp, {
		name: safe,
		createdAt: metadata.createdAt || new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		items: Array.isArray(items) ? items : [],
	});
	return fp;
}

export async function loadPlaylist(name) {
	await ensureDir();
	const fp = filePath(assertName(name));
	if (!(await exists(fp))) {
		return null;
	}
	return readJson(fp);
}

export async function listPlaylists() {
	await ensureDir();
	const entries = await readdir(PLAYLIST_DIR);
	return entries
		.filter((n) => n.endsWith(".json"))
		.map((n) => n.replace(/\.json$/i, ""))
		.sort();
}

export async function deletePlaylist(name) {
	await ensureDir();
	const fp = filePath(assertName(name));
	if (!(await exists(fp))) {
		return false;
	}
	await rm(fp, { force: true });
	return true;
}

export async function renamePlaylist(oldName, newName) {
	await ensureDir();
	const oldPath = filePath(assertName(oldName));
	const newPath = filePath(assertName(newName));
	if (!(await exists(oldPath))) {
		return { ok: false, reason: "not_found" };
	}
	if (await exists(newPath)) {
		return { ok: false, reason: "target_exists" };
	}

	const data = await readJson(oldPath);
	await renameFile(oldPath, newPath);
	await writeJsonAtomic(newPath, {
		...data,
		name: assertName(newName),
		updatedAt: new Date().toISOString(),
	});
	return { ok: true };
}
