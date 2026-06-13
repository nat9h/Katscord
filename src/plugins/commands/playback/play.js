import { defineCommand } from "#core/plugins/defineCommand";
import {
	buildYouTubeQueueItem,
	createPendingInteraction,
	extractPlayOptions,
} from "#plugins/commands/playback/_state";
import {
	buildLocalQueueItem,
	buildLocalQueueItemsFromDirectory,
	isLocalDirectory,
	isLocalFile,
} from "#utils/localMedia";
import { formatTime } from "#utils/time";

export default defineCommand({
	name: "play",
	aliases: ["p"],
	category: "playback",
	requiresSession: true,
	help: {
		group: "playback",
		usage: "{prefix}{command} <query|url|path> [-audio|-video|-spotify|-local] [-quality auto|low|medium|high]",
		description: "Play YouTube, Spotify, or local media",
		details: [
			"Search keyword uses YouTube search if no direct URL is given",
			"Direct YouTube links default to AUDIO unless -video is used",
			"Spotify links are resolved into AUDIO queue items",
			"-local <path> plays a local file or folder",
			"-local --recursive scans subfolders",
			"-quality (default auto) — auto picks based on source resolution",
		],
	},
	args: { min: 1, usage: "{prefix}{command} <query>" },

	async execute({ ctx, message, args = [], session, respond }) {
		const {
			input,
			forcedMode,
			quality,
			isSpotifySearch,
			isLocal,
			recursive,
		} = extractPlayOptions(args);
		if (!input) {
			return respond.reply(message, "Input query or link!");
		}

		// --- Local file/folder ---
		if (isLocal || isLocalFile(input) || isLocalDirectory(input)) {
			if (isLocalFile(input)) {
				const item = await buildLocalQueueItem(
					input,
					forcedMode,
					ctx.mediaProbeService
				);
				session.playback.enqueue(item);
				return respond.reply(
					message,
					`Local file added: **${item.title}** as **${item.mode.toUpperCase()}**.`
				);
			}

			if (isLocalDirectory(input)) {
				const items = await buildLocalQueueItemsFromDirectory(
					input,
					forcedMode,
					ctx.mediaProbeService,
					{ recursive }
				);
				if (!items.length) {
					return respond.reply(
						message,
						"No playable media files found."
					);
				}
				session.playback.enqueueMany(items);
				return respond.reply(
					message,
					`Added **${items.length}** local item(s).${recursive ? " (recursive)" : ""}`
				);
			}

			return respond.reply(message, "Local path not found.");
		}

		// --- Spotify URL ---
		if (/open\.spotify\.com|spotify:/.test(input)) {
			await respond.notice(message, "Resolving Spotify content...");
			const result = await ctx.spotifyService.resolveContent(input);
			const items = result.items.map((item) => ({
				...item,
				mode: "audio",
			}));
			session.playback.enqueueMany(items);

			if (result.name) {
				const type = result.type === "playlist" ? "Playlist" : "Album";
				return respond.reply(
					message,
					`**${result.name}**\nAdded **${items.length} tracks** from ${type} to queue as **AUDIO**.`,
					{ preferReply: false }
				);
			}

			if (items[0]) {
				const item = items[0];
				const title = item.artist
					? `${item.artist} - ${item.title}`
					: item.title;
				return respond.reply(
					message,
					`Spotify Track Added:\n**${title}** (${item.duration ? formatTime(item.duration) : "Unknown"}) [AUDIO]`,
					{ preferReply: false }
				);
			}
			return null;
		}

		// --- Spotify Search ---
		if (isSpotifySearch) {
			await respond.notice(
				message,
				`Searching Spotify for: **${input}**...`
			);
			const tracks = await ctx.spotifyService.searchTracks(input, 5);
			if (!tracks?.length) {
				return respond.reply(message, "No Spotify tracks found.");
			}

			const description = tracks
				.map((t, i) => {
					const artists = t.artists.map((a) => a.name).join(", ");
					const dur = t.duration_ms
						? formatTime(Math.floor(t.duration_ms / 1000))
						: "Unknown";
					return `**${i + 1}.** ${t.name} - ${artists} (${dur})`;
				})
				.join("\n");

			await respond.notice(
				message,
				`Spotify Search Results:\n\n${description}\n\nReply with a number (1-${tracks.length}) or 'cancel'`
			);
			createPendingInteraction(
				ctx,
				message,
				"spotifySearch",
				tracks,
				"Spotify selection timed out."
			);
			return null;
		}

		// --- YouTube URL ---
		if (/youtube\.com|youtu\.be/.test(input)) {
			const mode = forcedMode || "audio";

			if (/[&?]list=|\/playlist/.test(input)) {
				await respond.notice(message, "Fetching playlist info...");
				try {
					const videos =
						await ctx.ytdlpService.getPlaylistInfo(input);
					if (!videos.length) {
						return respond.reply(
							message,
							"Playlist is empty or cannot be accessed."
						);
					}
					session.playback.enqueueMany(
						videos.map((v) =>
							buildYouTubeQueueItem(v, mode, { quality })
						)
					);
					return respond.reply(
						message,
						`Added **${videos.length}** videos to queue as **${mode.toUpperCase()}**${mode === "video" ? ` [${quality}]` : ""}.`
					);
				} catch {
					return respond.reply(message, "Failed to fetch playlist.");
				}
			}

			await respond.notice(message, "Fetching video info...");
			try {
				const info = await ctx.ytdlpService.getVideoInfo(input);
				session.playback.enqueue(
					buildYouTubeQueueItem(
						{
							title: info.title,
							original_url: input,
							duration: info.duration,
							thumbnail: info.thumbnail,
							height: info.height,
						},
						mode,
						{ quality }
					)
				);
				return respond.reply(
					message,
					`Added **${info.title}** (${info.duration ? formatTime(info.duration) : "Unknown"}) as **${mode.toUpperCase()}**${mode === "video" ? ` [${quality}]` : ""}.`
				);
			} catch {
				session.playback.enqueue(
					buildYouTubeQueueItem(
						{
							title: "YouTube Link",
							original_url: input,
							duration: null,
							thumbnail: "",
						},
						mode,
						{ quality }
					)
				);
				return respond.reply(
					message,
					`YouTube link added as **${mode.toUpperCase()}**${mode === "video" ? ` [${quality}]` : ""}.`
				);
			}
		}

		// --- YouTube Search ---
		await respond.notice(message, "Searching YouTube...");
		const results = await ctx.ytdlpService.search(input, 8);
		if (!results.length) {
			return respond.reply(message, "No results found.");
		}

		const description = results
			.map(
				(r, i) =>
					`**${i + 1}.** ${r.title}${r.duration ? ` (${formatTime(r.duration)})` : ""}`
			)
			.join("\n");

		await respond.notice(
			message,
			`Search Results:\n\n${description}\n\nReply with a number (1-${results.length}) or 'cancel'`
		);
		createPendingInteraction(
			ctx,
			message,
			"search",
			results,
			"Search selection timed out.",
			{ quality }
		);
		return null;
	},
});
