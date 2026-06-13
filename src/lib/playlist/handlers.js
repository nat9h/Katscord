/**
 * Subcommand handlers for the `!playlist` command.
 * Each handler receives a uniform payload: { ctx, message, respond, session, args, prefix }.
 */
import { resolveQueueItems } from "#lib/playback/resolveQueueItems";
import { cloneQueueForSave, hydrateItem } from "#lib/playlist/items";
import {
	deletePlaylist,
	listPlaylists,
	loadPlaylist,
	renamePlaylist,
	savePlaylist,
} from "#plugins/commands/playlist/_store";
import { parseNameAndRest, parseTwoNames } from "#utils/text/parseArgs";
import { formatTime } from "#utils/time";

export function renderPlaylistUsage(prefix) {
	return [
		`\`${prefix} save <name>\``,
		`\`${prefix} load <name>\``,
		`\`${prefix} list\``,
		`\`${prefix} show <name>\``,
		`\`${prefix} delete <name>\``,
		`\`${prefix} add <name> <url/path>\``,
		`\`${prefix} rename <old> <new>\``,
		`\`${prefix} remove <name> <index>\``,
	].join(" | ");
}

function requireName(name, message, respond) {
	if (!name) {
		respond.reply(message, "Playlist name is required.");
		return false;
	}
	return true;
}

async function handleList({ message, respond }) {
	const names = await listPlaylists();
	if (!names.length) {
		return respond.reply(message, "No saved playlists.");
	}
	return respond.reply(
		message,
		`Saved playlists:\n${names.map((n, i) => `**${i + 1}.** ${n}`).join("\n")}`
	);
}

async function handleSave({ message, respond, session, args }) {
	if (!session) {
		return respond.reply(message, "No session for this guild.");
	}
	const { name } = parseNameAndRest(args);
	if (!requireName(name, message, respond)) {
		return null;
	}

	const items = cloneQueueForSave(session);
	if (!items.length) {
		return respond.reply(message, "Queue is empty.");
	}

	const existing = await loadPlaylist(name);
	await savePlaylist(name, items, { createdAt: existing?.createdAt });
	return respond.reply(
		message,
		`Playlist **${name}** saved with **${items.length}** item(s).`
	);
}

async function handleLoad({ ctx, message, respond, session, args }) {
	if (!session) {
		return respond.reply(message, "No session for this guild.");
	}
	const { name } = parseNameAndRest(args);
	if (!requireName(name, message, respond)) {
		return null;
	}

	const data = await loadPlaylist(name);
	if (!data) {
		return respond.reply(message, "Playlist not found.");
	}

	const items = [];
	let skipped = 0;
	for (const item of data.items || []) {
		const hydrated = await hydrateItem(ctx, item);
		if (hydrated) {
			items.push(hydrated);
		} else {
			skipped++;
		}
	}

	if (!items.length) {
		return respond.reply(message, "No playable items found.");
	}

	session.playback.enqueueMany(items);
	return respond.reply(
		message,
		`Loaded **${name}** with **${items.length}** item(s)${skipped ? `, skipped **${skipped}**` : ""}.`
	);
}

async function handleShow({ message, respond, args }) {
	const { name } = parseNameAndRest(args);
	if (!requireName(name, message, respond)) {
		return null;
	}

	const data = await loadPlaylist(name);
	if (!data) {
		return respond.reply(message, "Playlist not found.");
	}

	const total = data.items?.length || 0;
	const lines = (data.items || [])
		.slice(0, 15)
		.map((item, i) => {
			const dur = item.duration ? formatTime(item.duration) : "Unknown";
			return `**${i + 1}.** ${item.title} \`[${(item.mode || "audio").toUpperCase()} | ${dur}]\``;
		})
		.join("\n");

	const extra = total > 15 ? `\n\n...and **${total - 15}** more.` : "";
	return respond.notice(
		message,
		`# **Playlist: ${name}**\n\n${lines || "_Empty_"}${extra}`
	);
}

async function handleDelete({ message, respond, args }) {
	const { name } = parseNameAndRest(args);
	if (!requireName(name, message, respond)) {
		return null;
	}

	const ok = await deletePlaylist(name);
	return respond.reply(
		message,
		ok ? `Playlist **${name}** deleted.` : "Playlist not found."
	);
}

async function handleAdd({ ctx, message, respond, args, prefix }) {
	const { name, rest } = parseNameAndRest(args);
	if (!requireName(name, message, respond)) {
		return null;
	}
	if (!rest) {
		return respond.reply(
			message,
			`Usage: \`${prefix} add <name> <url/path>\``
		);
	}

	const existing = await loadPlaylist(name);
	if (!existing) {
		return respond.reply(message, "Playlist not found.");
	}

	const newItems = await resolveQueueItems(ctx, rest, { mode: "audio" });
	if (!newItems.length) {
		return respond.reply(message, "No playable items found.");
	}

	const merged = [...(existing.items || []), ...newItems];
	await savePlaylist(name, merged, { createdAt: existing.createdAt });
	return respond.reply(
		message,
		`Added **${newItems.length}** item(s) to **${name}**. Total: **${merged.length}**.`
	);
}

async function handleRename({ message, respond, args, prefix }) {
	const { firstName, secondName } = parseTwoNames(args);
	if (!firstName || !secondName) {
		return respond.reply(
			message,
			`Usage: \`${prefix} rename <old> <new>\``
		);
	}

	const result = await renamePlaylist(firstName, secondName);
	if (!result.ok) {
		return respond.reply(
			message,
			result.reason === "not_found"
				? "Playlist not found."
				: "Target name already exists."
		);
	}
	return respond.reply(
		message,
		`Playlist renamed: **${firstName}** → **${secondName}**.`
	);
}

async function handleRemove({ message, respond, args, prefix }) {
	const { name, rest } = parseNameAndRest(args);
	if (!requireName(name, message, respond)) {
		return null;
	}

	const index = Number.parseInt(rest, 10);
	if (!Number.isInteger(index) || index < 1) {
		return respond.reply(
			message,
			`Usage: \`${prefix} remove <name> <index>\``
		);
	}

	const data = await loadPlaylist(name);
	if (!data) {
		return respond.reply(message, "Playlist not found.");
	}

	const items = [...(data.items || [])];
	if (index > items.length) {
		return respond.reply(
			message,
			`Invalid index. Only **${items.length}** item(s).`
		);
	}

	const [removed] = items.splice(index - 1, 1);
	await savePlaylist(name, items, { createdAt: data.createdAt });
	return respond.reply(
		message,
		`Removed **#${index}** from **${name}**: **${removed?.title || "Unknown"}**. Remaining: **${items.length}**.`
	);
}

export const PLAYLIST_SUBCOMMANDS = {
	list: handleList,
	save: handleSave,
	load: handleLoad,
	show: handleShow,
	delete: handleDelete,
	add: handleAdd,
	rename: handleRename,
	remove: handleRemove,
};
