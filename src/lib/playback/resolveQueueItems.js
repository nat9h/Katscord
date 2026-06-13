/**
 * Resolves a user-provided input (local path, YouTube URL, Spotify URL)
 * into one or more queue items ready to be enqueued.
 */
import { buildYouTubeQueueItem } from "#plugins/commands/playback/_state";
import {
	buildLocalQueueItem,
	buildLocalQueueItemsFromDirectory,
	isLocalDirectory,
	isLocalFile,
} from "#utils/localMedia";

const SPOTIFY_REGEX = /open\.spotify\.com|spotify:/;
const YOUTUBE_REGEX = /youtube\.com|youtu\.be/;
const PLAYLIST_REGEX = /[&?]list=|\/playlist/;

export async function resolveQueueItems(
	ctx,
	target,
	{ mode = "audio", quality = "auto", recursive = false } = {}
) {
	const input = String(target || "").trim();
	if (!input) {
		throw new Error("URL/path is required.");
	}

	if (isLocalFile(input)) {
		return [await buildLocalQueueItem(input, mode, ctx.mediaProbeService)];
	}

	if (isLocalDirectory(input)) {
		return buildLocalQueueItemsFromDirectory(
			input,
			mode,
			ctx.mediaProbeService,
			{ recursive }
		);
	}

	if (SPOTIFY_REGEX.test(input)) {
		const result = await ctx.spotifyService.resolveContent(input);
		return result.items.map((item) => ({ ...item, mode: "audio" }));
	}

	if (YOUTUBE_REGEX.test(input)) {
		if (PLAYLIST_REGEX.test(input)) {
			const videos = await ctx.ytdlpService.getPlaylistInfo(input);
			return videos.map((v) =>
				buildYouTubeQueueItem(v, mode, { quality })
			);
		}

		const info = await ctx.ytdlpService.getVideoInfo(input);
		return [
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
			),
		];
	}

	throw new Error(
		"Unsupported input. Use YouTube/Spotify URL, local file, or folder."
	);
}
