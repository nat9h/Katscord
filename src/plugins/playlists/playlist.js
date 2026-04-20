import { buildYouTubeQueueItem } from "#plugins/playback/state";
import {
	deletePlaylist,
	listPlaylists,
	loadPlaylist,
	renamePlaylist,
	savePlaylist,
} from "#plugins/playlists/store";
import {
	buildLocalQueueItem,
	buildLocalQueueItemsFromDirectory,
	isLocalDirectory,
	isLocalFile,
} from "#utils/localMedia";
import { formatTime } from "#utils/time";

function cloneQueueForSave(session) {
	const items = [];
	const current = session?.playback?.getCurrent?.();
	const queue = session?.playback?.getQueue?.() || [];

	if (current) items.push({ ...current });
	for (const item of queue) items.push({ ...item });

	return items.map((item) => ({
		source: item.source,
		mode: item.mode,
		title: item.title,
		artist: item.artist || "",
		duration: item.duration || null,
		thumbnail: item.thumbnail || "",
		originalInput: item.originalInput || "",
		localPath: item.localPath || null,
		youtubeQuery: item.youtubeQuery || null,
		spotifyUrl: item.spotifyUrl || null,
	}));
}

async function hydratePlaylistItem(ctx, item) {
	if (item.source === "local" && item.localPath) {
		if (!isLocalFile(item.localPath)) {
			return null;
		}

		return buildLocalQueueItem(
			item.localPath,
			item.mode || null,
			ctx.mediaProbeService
		);
	}

	return { ...item };
}

function consumeLeadingValue(input) {
	const value = String(input || "").trim();
	if (!value) return null;

	const first = value[0];
	if (first === '"' || first === "'") {
		const end = value.indexOf(first, 1);
		if (end === -1) {
			return {
				value: value.slice(1),
				rest: "",
			};
		}

		return {
			value: value.slice(1, end),
			rest: value.slice(end + 1).trim(),
		};
	}

	const match = value.match(/^(\S+)(?:\s+([\s\S]*))?$/);
	if (!match) return null;

	return {
		value: match[1],
		rest: (match[2] || "").trim(),
	};
}

function parseNameAndRest(args) {
	const raw = args.join(" ").trim();
	const first = consumeLeadingValue(raw);

	if (!first) {
		return { name: "", rest: "" };
	}

	return {
		name: first.value,
		rest: first.rest,
	};
}

function parseTwoNames(args) {
	const raw = args.join(" ").trim();
	const first = consumeLeadingValue(raw);

	if (!first) {
		return { firstName: "", secondName: "" };
	}

	const second = consumeLeadingValue(first.rest);

	return {
		firstName: first.value,
		secondName: second?.value || "",
	};
}

async function resolveAddTarget(ctx, target) {
	const input = String(target || "").trim();
	if (!input) {
		throw new Error("URL/path is required.");
	}

	if (isLocalFile(input)) {
		return [await buildLocalQueueItem(input, null, ctx.mediaProbeService)];
	}

	if (isLocalDirectory(input)) {
		return await buildLocalQueueItemsFromDirectory(
			input,
			null,
			ctx.mediaProbeService,
			{ recursive: false }
		);
	}

	if (/open\.spotify\.com|spotify:/.test(input)) {
		const result = await ctx.spotifyService.resolveContent(input);

		return result.items.map((item) => ({
			...item,
			mode: "audio",
		}));
	}

	if (/youtube\.com|youtu\.be/.test(input)) {
		if (/[&?]list=/.test(input) || /\/playlist/.test(input)) {
			const videos = await ctx.ytdlpService.getPlaylistInfo(input);
			return videos.map((video) => buildYouTubeQueueItem(video, "audio"));
		}

		const videoInfo = await ctx.ytdlpService.getVideoInfo(input);

		return [
			buildYouTubeQueueItem(
				{
					title: videoInfo.title,
					original_url: input,
					duration: videoInfo.duration,
					thumbnail: videoInfo.thumbnail,
				},
				"audio"
			),
		];
	}

	throw new Error(
		"Unsupported input. Use a YouTube/Spotify URL, local file path, or local folder path."
	);
}

export default {
	kind: "command",
	name: "playlist",
	aliases: ["pl"],
	help: {
		group: "playlist",
		usage: "playlist <subcommand> ...",
		description: "Manage saved playlists from queue, URL, or local media",
		details: [
			"save <name> — save current queue into a playlist file",
			"load <name> — load a saved playlist into the current queue",
			"list — show all saved playlists",
			"show <name> — display playlist contents",
			"add <name> <url/path> — append YouTube, Spotify, local file, or folder",
			"remove <name> <index> — remove one item by 1-based index",
			"rename <old> <new> — rename saved playlist",
			"delete <name> — delete saved playlist permanently",
		],
	},
	failed: "Failed to execute %command: %error",

	async execute({
		ctx,
		message,
		args = [],
		usedPrefix = "!",
		session,
		respond,
		command,
	}) {
		const sub = String(args.shift() || "").toLowerCase();

		if (!sub) {
			return respond.reply(
				message,
				[
					"Usage:",
					`\`${usedPrefix + command} save <name>\``,
					`\`${usedPrefix + command} load <name>\``,
					`\`${usedPrefix + command} list\``,
					`\`${usedPrefix + command} show <name>\``,
					`\`${usedPrefix + command} delete <name>\``,
					`\`${usedPrefix + command} add <name> <url/path>\``,
					`\`${usedPrefix + command} rename <old> <new>\``,
					`\`${usedPrefix + command} remove <name> <index>\``,
				].join(" | ")
			);
		}

		if (sub === "list") {
			const names = await listPlaylists();

			if (!names.length) {
				return respond.reply(message, "No saved playlists.");
			}

			return respond.reply(
				message,
				`Saved playlists:\n${names.map((n, i) => `**${i + 1}.** ${n}`).join("\n")}`
			);
		}

		if (sub === "save") {
			if (!message.guild?.id) {
				return respond.reply(message, "Use this command in a guild.");
			}

			if (!session) {
				return respond.reply(
					message,
					`No session for this guild yet. Use \`${prefix}config bot <voiceChannelId>\` first.`
				);
			}

			const { name } = parseNameAndRest(args);

			if (!name) {
				return respond.reply(message, "Playlist name is required.");
			}

			const items = cloneQueueForSave(session);

			if (!items.length) {
				return respond.reply(
					message,
					"Nothing to save. Queue is empty."
				);
			}

			const existing = await loadPlaylist(name);

			await savePlaylist(name, items, {
				createdAt: existing?.createdAt,
			});

			return respond.reply(
				message,
				`Playlist **${name}** saved with **${items.length}** item(s).`
			);
		}

		if (sub === "load") {
			if (!message.guild?.id) {
				return respond.reply(message, "Use this command in a guild.");
			}

			if (!session) {
				return respond.reply(
					message,
					`No session for this guild yet. Use \`${prefix}config bot <voiceChannelId>\` first.`
				);
			}

			const { name } = parseNameAndRest(args);

			if (!name) {
				return respond.reply(message, "Playlist name is required.");
			}

			const data = await loadPlaylist(name);

			if (!data) {
				return respond.reply(message, "Playlist not found.");
			}

			const items = [];
			let skipped = 0;

			for (const item of data.items || []) {
				const hydrated = await hydratePlaylistItem(ctx, item);
				if (hydrated) {
					items.push(hydrated);
				} else {
					skipped++;
				}
			}

			if (!items.length) {
				return respond.reply(
					message,
					"Playlist exists, but no playable items were found."
				);
			}

			session.playback.enqueueMany(items);

			return respond.reply(
				message,
				`Loaded playlist **${name}** with **${items.length}** item(s)${
					skipped
						? `, skipped **${skipped}** missing local item(s)`
						: ""
				}.`
			);
		}

		if (sub === "show") {
			const { name } = parseNameAndRest(args);

			if (!name) {
				return respond.reply(message, "Playlist name is required.");
			}

			const data = await loadPlaylist(name);

			if (!data) {
				return respond.reply(message, "Playlist not found.");
			}

			const lines = (data.items || [])
				.slice(0, 15)
				.map((item, index) => {
					const duration = item.duration
						? formatTime(item.duration)
						: "Unknown";

					return `**${index + 1}.** ${item.title} \`[${(
						item.mode || "audio"
					).toUpperCase()} | ${duration}]\``;
				})
				.join("\n");

			const extra =
				(data.items?.length || 0) > 15
					? `\n\n...and **${data.items.length - 15}** more item(s).`
					: "";

			return respond.notice(
				message,
				`# **Playlist: ${name}**\n\n${lines || "_Empty_"}${extra}`
			);
		}

		if (sub === "delete") {
			const { name } = parseNameAndRest(args);

			if (!name) {
				return respond.reply(message, "Playlist name is required.");
			}

			const ok = await deletePlaylist(name);

			return respond.reply(
				message,
				ok ? `Playlist **${name}** deleted.` : "Playlist not found."
			);
		}

		if (sub === "add") {
			const { name, rest } = parseNameAndRest(args);

			if (!name) {
				return respond.reply(message, "Playlist name is required.");
			}

			if (!rest) {
				return respond.reply(
					message,
					`Usage: \`${usedPrefix + command} add <name> <url/path>\``
				);
			}

			const existing = await loadPlaylist(name);

			if (!existing) {
				return respond.reply(message, "Playlist not found.");
			}

			const newItems = await resolveAddTarget(ctx, rest);

			if (!newItems.length) {
				return respond.reply(
					message,
					"No playable items found from that input."
				);
			}

			const mergedItems = [...(existing.items || []), ...newItems];

			await savePlaylist(name, mergedItems, {
				createdAt: existing.createdAt,
			});

			return respond.reply(
				message,
				`Added **${newItems.length}** item(s) to playlist **${name}**. Total: **${mergedItems.length}**.`
			);
		}

		if (sub === "rename") {
			const { firstName, secondName } = parseTwoNames(args);

			if (!firstName || !secondName) {
				return respond.reply(
					message,
					`Usage: \`${usedPrefix + command} rename <old> <new>\``
				);
			}

			const result = await renamePlaylist(firstName, secondName);

			if (!result.ok) {
				if (result.reason === "not_found") {
					return respond.reply(message, "Playlist not found.");
				}

				if (result.reason === "target_exists") {
					return respond.reply(
						message,
						"Target playlist name already exists."
					);
				}

				return respond.reply(message, "Failed to rename playlist.");
			}

			return respond.reply(
				message,
				`Playlist renamed: **${firstName}** → **${secondName}**.`
			);
		}

		if (sub === "remove") {
			const { name, rest } = parseNameAndRest(args);

			if (!name) {
				return respond.reply(message, "Playlist name is required.");
			}

			const index = Number.parseInt(rest, 10);

			if (!Number.isInteger(index) || index < 1) {
				return respond.reply(
					message,
					`Usage: \`${usedPrefix + command} remove <name> <index>\``
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
					`Invalid index. Playlist **${name}** only has **${items.length}** item(s).`
				);
			}

			const [removed] = items.splice(index - 1, 1);

			await savePlaylist(name, items, {
				createdAt: data.createdAt,
			});

			return respond.reply(
				message,
				`Removed item **#${index}** from playlist **${name}**: **${
					removed?.title || "Unknown"
				}**. Remaining: **${items.length}**.`
			);
		}

		return respond.reply(message, "Unknown playlist subcommand.");
	},
};
