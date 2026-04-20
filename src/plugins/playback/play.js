import {
	buildYouTubeQueueItem,
	createPendingInteraction,
	extractPlayOptions,
} from "#plugins/playback/state";
import { formatTime } from "#utils/time";

export default {
	kind: "command",
	name: "play",
	aliases: ["p"],
	help: {
		group: "playback",
		usage: "play <query|url|path> [-audio|-video|-spotify]",
		description: "Play YouTube, Spotify, local file, or local folder",
		details: [
			"Search keyword will use YouTube search if no direct URL/path is given",
			"Direct YouTube links default to AUDIO unless -video is used",
			"Spotify links are resolved into AUDIO queue items",
			"Local file and local folder are also supported",
		],
	},
	failed: "Failed to execute %command: %error",

	async execute({
		ctx,
		message,
		args = [],
		session,
		respond,
		usedPrefix = "!",
	}) {
		if (!message.guild?.id) {
			return respond.reply(message, "Use this command in a guild.");
		}

		if (!session) {
			return respond.reply(
				message,
				`No session for this guild yet. Use \`${usedPrefix}config bot <voiceChannelId>\` first.`
			);
		}

		const { input, forcedMode, isSpotifySearch } = extractPlayOptions(args);

		if (!input) {
			return respond.reply(message, "Input query or link!");
		}

		if (/open\.spotify\.com|spotify:/.test(input)) {
			await respond.notice(message, "Resolving Spotify content...");

			const result = await ctx.spotifyService.resolveContent(input);

			const items = result.items.map((item) => ({
				...item,
				mode: "audio",
			}));

			session.playback.enqueueMany(items);

			if (result.name) {
				const contentType =
					result.type === "playlist" ? "Playlist" : "Album";

				return respond.reply(
					message,
					`**${result.name}**\nAdded **${items.length} tracks** from ${contentType} to queue as **AUDIO**.`,
					{ preferReply: false }
				);
			}

			if (items[0]) {
				const item = items[0];
				const displayTitle = item.artist
					? `${item.artist} - ${item.title}`
					: item.title;
				const durationText = item.duration
					? formatTime(item.duration)
					: "Unknown";

				return respond.reply(
					message,
					`Spotify Track Added:\n**${displayTitle}** (${durationText}) [AUDIO]`,
					{ preferReply: false }
				);
			}

			return null;
		}

		if (isSpotifySearch) {
			await respond.notice(
				message,
				`Searching Spotify for: **${input}**...`
			);

			const tracks = await ctx.spotifyService.searchTracks(input, 5);

			if (!tracks || tracks.length === 0) {
				return respond.reply(message, "No Spotify tracks found.");
			}

			const description = tracks
				.map((t, i) => {
					const artists = t.artists.map((a) => a.name).join(", ");
					const duration = t.duration_ms
						? formatTime(Math.floor(t.duration_ms / 1000))
						: "Unknown";

					return `**${i + 1}.** ${t.name} - ${artists} (${duration})`;
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

		if (/youtube\.com|youtu\.be/.test(input)) {
			const resolvedMode = forcedMode || "audio";

			if (/[&?]list=/.test(input) || /\/playlist/.test(input)) {
				await respond.notice(message, "Fetching playlist info...");

				try {
					const videos =
						await ctx.ytdlpService.getPlaylistInfo(input);

					if (videos.length === 0) {
						return respond.reply(
							message,
							"Playlist is empty or cannot be accessed."
						);
					}

					const items = videos.map((video) =>
						buildYouTubeQueueItem(video, resolvedMode)
					);

					session.playback.enqueueMany(items);

					return respond.reply(
						message,
						`Playlist contains ${videos.length} videos.\nAdded all to queue as **${resolvedMode.toUpperCase()}**.`
					);
				} catch {
					return respond.reply(
						message,
						"Failed to fetch playlist. Make sure the URL is correct and playlist is public."
					);
				}
			}

			await respond.notice(message, "Fetching video info...");

			try {
				const videoInfo = await ctx.ytdlpService.getVideoInfo(input);
				const durationText = videoInfo.duration
					? formatTime(videoInfo.duration)
					: "Unknown";

				const queueItem = buildYouTubeQueueItem(
					{
						title: videoInfo.title,
						original_url: input,
						duration: videoInfo.duration,
						thumbnail: videoInfo.thumbnail,
					},
					resolvedMode
				);

				session.playback.enqueue(queueItem);

				return respond.reply(
					message,
					`Added **${videoInfo.title}** (${durationText}) to queue as **${resolvedMode.toUpperCase()}**.`
				);
			} catch {
				const queueItem = buildYouTubeQueueItem(
					{
						title: "YouTube Link",
						original_url: input,
						duration: null,
						thumbnail: "",
					},
					resolvedMode
				);

				session.playback.enqueue(queueItem);

				return respond.reply(
					message,
					`YouTube link added to queue as **${resolvedMode.toUpperCase()}**.`
				);
			}
		}

		await respond.notice(message, "Searching YouTube...");

		const results = await ctx.ytdlpService.search(input, 8);

		if (results.length === 0) {
			return respond.reply(message, "No results found.");
		}

		const description = results
			.map((r, i) => {
				const durationStr = r.duration
					? ` (${formatTime(r.duration)})`
					: "";
				return `**${i + 1}.** ${r.title}${durationStr}`;
			})
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
			"Search selection timed out."
		);

		return null;
	},
};
