/**
 * Shared playback state utilities: pending interactions, queue item builders, option parsing.
 */

function getPendingKey(channelId, authorId) {
	return `${channelId}:${authorId}`;
}

function getPlaybackState(ctx) {
	if (!ctx.runtime.playback) {
		ctx.runtime.playback = { pendingInteractions: new Map() };
	}
	if (!(ctx.runtime.playback.pendingInteractions instanceof Map)) {
		ctx.runtime.playback.pendingInteractions = new Map();
	}
	return ctx.runtime.playback;
}

export function getPendingInteraction(ctx, message) {
	const state = getPlaybackState(ctx);
	return (
		state.pendingInteractions.get(
			getPendingKey(message.channel.id, message.author.id)
		) || null
	);
}

export function clearPendingInteraction(ctx, target) {
	const state = getPlaybackState(ctx);
	if (!target) {
		return;
	}

	let key = null;
	let pending = null;

	if (target.channelId && target.authorId) {
		key = getPendingKey(target.channelId, target.authorId);
		pending = state.pendingInteractions.get(key) || target;
	} else if (target.channel?.id && target.author?.id) {
		key = getPendingKey(target.channel.id, target.author.id);
		pending = state.pendingInteractions.get(key) || null;
	}

	if (!key) {
		return;
	}
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
	timeoutMessage,
	options = {}
) {
	const state = getPlaybackState(ctx);
	clearPendingInteraction(ctx, message);

	const key = getPendingKey(message.channel.id, message.author.id);
	const pending = {
		type,
		data,
		options,
		channelId: message.channel.id,
		authorId: message.author.id,
		guildId: message.guild?.id || null,
		message,
		timeout: setTimeout(async () => {
			if (!state.pendingInteractions.has(key)) {
				return;
			}
			try {
				await message.channel.send(timeoutMessage);
			} catch {
				// ignore send failures on timeout
			}
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

const BOOLEAN_FLAGS = {
	video: ["-video", "--video", "-v"],
	audio: ["-audio", "--audio", "-music", "-a"],
	spotify: ["-spotify", "--spotify"],
	local: ["-local", "--local"],
	recursive: ["-r", "--recursive"],
};

const VALUE_FLAGS = {
	quality: ["-quality", "--quality", "-q"],
};

const VALID_QUALITIES = new Set(["auto", "low", "medium", "high"]);

function matchFlag(token, candidates) {
	const lower = token.toLowerCase();
	return candidates.some((flag) => flag === lower);
}

export function extractPlayOptions(args = []) {
	const rest = [];
	const flags = new Set();
	let quality = "auto";

	for (let i = 0; i < args.length; i++) {
		const token = args[i];

		let matchedValueFlag = null;
		for (const [name, candidates] of Object.entries(VALUE_FLAGS)) {
			const eqMatch = candidates.find((flag) =>
				token.toLowerCase().startsWith(`${flag}=`)
			);
			if (eqMatch) {
				const rawValue = token.slice(eqMatch.length + 1).trim();
				if (
					name === "quality" &&
					VALID_QUALITIES.has(rawValue.toLowerCase())
				) {
					quality = rawValue.toLowerCase();
				}
				matchedValueFlag = name;
				break;
			}

			if (matchFlag(token, candidates)) {
				const next = (args[i + 1] || "").toLowerCase();
				if (name === "quality" && VALID_QUALITIES.has(next)) {
					quality = next;
					i += 1;
				}
				matchedValueFlag = name;
				break;
			}
		}

		if (matchedValueFlag) {
			continue;
		}

		let matchedBoolFlag = false;
		for (const [name, candidates] of Object.entries(BOOLEAN_FLAGS)) {
			if (matchFlag(token, candidates)) {
				flags.add(name);
				matchedBoolFlag = true;
				break;
			}
		}

		if (!matchedBoolFlag) {
			rest.push(token);
		}
	}

	let forcedMode = null;
	if (flags.has("video")) {
		forcedMode = "video";
	} else if (flags.has("audio")) {
		forcedMode = "audio";
	}

	return {
		input: rest.join(" ").trim(),
		forcedMode,
		quality,
		isSpotifySearch: flags.has("spotify"),
		isLocal: flags.has("local"),
		recursive: flags.has("recursive"),
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

export function buildYouTubeQueueItem(item, mode, options = {}) {
	return {
		source: "youtube",
		mode,
		title: item.title,
		artist: item.artist || "",
		duration: item.duration || null,
		thumbnail: item.thumbnail || "",
		originalInput: item.original_url || item.url,
		sourceHeight: item.height || null,
		quality: options.quality || "auto",
	};
}
