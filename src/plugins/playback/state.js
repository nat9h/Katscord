import { respond } from "#utils/respond";

function getPendingKey(channelId, authorId) {
	return `${channelId}:${authorId}`;
}

export function getPlaybackState(ctx) {
	if (!ctx.runtime.playback) {
		ctx.runtime.playback = {
			pendingInteractions: new Map(),
		};
	}

	if (!(ctx.runtime.playback.pendingInteractions instanceof Map)) {
		ctx.runtime.playback.pendingInteractions = new Map();
	}

	return ctx.runtime.playback;
}

export function getPendingInteraction(ctx, message) {
	const state = getPlaybackState(ctx);
	const key = getPendingKey(message.channel.id, message.author.id);
	return state.pendingInteractions.get(key) || null;
}

export function clearPendingInteraction(ctx, target) {
	const state = getPlaybackState(ctx);

	if (!target) return;

	let key = null;
	let pending = null;

	if (target.channelId && target.authorId) {
		key = getPendingKey(target.channelId, target.authorId);
		pending = state.pendingInteractions.get(key) || target;
	} else if (target.channel?.id && target.author?.id) {
		key = getPendingKey(target.channel.id, target.author.id);
		pending = state.pendingInteractions.get(key) || null;
	}

	if (!key) return;

	if (pending?.timeout) {
		clearTimeout(pending.timeout);
	}

	state.pendingInteractions.delete(key);
}

export function createPendingInteraction(
	ctx,
	message,
	type,
	data,
	timeoutMessage
) {
	const state = getPlaybackState(ctx);

	clearPendingInteraction(ctx, message);

	const key = getPendingKey(message.channel.id, message.author.id);

	const pending = {
		type,
		data,
		channelId: message.channel.id,
		authorId: message.author.id,
		guildId: message.guild?.id || null,
		message,
		timeout: setTimeout(async () => {
			const latest = state.pendingInteractions.get(key);
			if (!latest) return;

			try {
				await respond(latest.message, timeoutMessage, {
					preferReply: false,
				});
			} catch {}

			state.pendingInteractions.delete(key);
		}, 60000),
	};

	state.pendingInteractions.set(key, pending);
	return pending;
}

export function isPendingInputMessage(type, input) {
	const value = input.trim().toLowerCase();

	switch (type) {
		case "spotifySearch":
		case "search":
			return /^(cancel|\d+)$/.test(value);

		case "mode":
		case "playlistMode":
			return /^(cancel|1|2|audio|music|video)$/.test(value);

		default:
			return false;
	}
}

export function extractPlayOptions(args = []) {
	const flags = new Set(args.map((arg) => arg.toLowerCase()));

	const cleanArgs = args.filter(
		(arg) =>
			!/^-(spotify|video|audio|music|v|a)$/i.test(arg) &&
			!/^--(spotify|video|audio|music)$/i.test(arg)
	);

	let forcedMode = null;

	if (flags.has("-video") || flags.has("--video") || flags.has("-v")) {
		forcedMode = "video";
	} else if (
		flags.has("-audio") ||
		flags.has("--audio") ||
		flags.has("-music") ||
		flags.has("--music") ||
		flags.has("-a")
	) {
		forcedMode = "audio";
	}

	const isSpotifySearch = flags.has("-spotify") || flags.has("--spotify");

	return {
		input: cleanArgs.join(" ").trim(),
		forcedMode,
		isSpotifySearch,
	};
}

export function parseModeInput(input) {
	const value = input.trim().toLowerCase();

	if (value === "1" || value === "audio" || value === "music") {
		return "audio";
	}

	if (value === "2" || value === "video") {
		return "video";
	}

	return null;
}

export function buildSpotifyQueueItem(track) {
	return {
		source: "spotify",
		mode: "audio",
		title: track.name,
		artist: track.artists.map((a) => a.name).join(", "),
		duration: track.duration_ms
			? Math.floor(track.duration_ms / 1000)
			: null,
		thumbnail: track.album?.images?.[0]?.url || "",
		originalInput: track.external_urls?.spotify || track.uri,
		youtubeQuery: `${track.artists[0]?.name || ""} - ${track.name}`,
		spotifyUrl: track.external_urls?.spotify,
	};
}

export function buildYouTubeQueueItem(item, mode) {
	return {
		source: "youtube",
		mode,
		title: item.title,
		artist: item.artist || "",
		duration: item.duration || null,
		thumbnail: item.thumbnail || "",
		originalInput: item.original_url || item.url,
	};
}
