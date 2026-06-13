/**
 * Helpers to convert between live playback queue items and the JSON shape
 * stored on disk by the playlist store.
 */
import { buildLocalQueueItem, isLocalFile } from "#utils/localMedia";

export function cloneQueueForSave(session) {
	const items = [];
	const current = session?.playback?.getCurrent?.();
	const queue = session?.playback?.getQueue?.() || [];

	if (current) {
		items.push(current);
	}
	items.push(...queue);

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
		quality: item.quality || "auto",
		sourceHeight: item.sourceHeight || null,
	}));
}

export async function hydrateItem(ctx, item) {
	if (!item) {
		return null;
	}

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
