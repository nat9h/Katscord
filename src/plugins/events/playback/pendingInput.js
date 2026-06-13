import { defineEvent } from "#core/plugins/defineEvent";
import {
	buildSpotifyQueueItem,
	buildYouTubeQueueItem,
	clearPendingInteraction,
	createPendingInteraction,
	getPendingInteraction,
	isPendingInputMessage,
	parseModeInput,
} from "#plugins/commands/playback/_state";
import { formatTime } from "#utils/time";

function resolvePendingSession(ctx, message, pending) {
	const guildId = pending?.guildId || message.guild?.id || null;
	if (!guildId) {
		return null;
	}
	return (
		ctx.sessionManager?.getSession?.(guildId) ||
		ctx.sessionManager?.ensureSession?.(guildId) ||
		null
	);
}

export default defineEvent({
	name: "messageCreate",
	priority: 100,

	async execute({ ctx, args, respond }) {
		const [message] = args;
		if (!message?.author?.id) {
			return false;
		}
		if (!ctx.isTrustedAuthor?.(message.author.id)) {
			return false;
		}

		const pending = getPendingInteraction(ctx, message);
		if (!pending) {
			return false;
		}

		const session = resolvePendingSession(ctx, message, pending);
		if (!session) {
			clearPendingInteraction(ctx, pending);
			await respond.reply(
				message,
				"No active session. Use `config bot <voiceChannelId>` first."
			);
			return true;
		}

		const rawInput = message.content.trim().toLowerCase();

		if (rawInput === "cancel") {
			clearPendingInteraction(ctx, pending);
			await respond.reply(message, "Selection cancelled.");
			return true;
		}

		if (!isPendingInputMessage(pending.type, rawInput)) {
			return true;
		}

		if (pending.type === "spotifySearch") {
			const num = Number.parseInt(rawInput, 10);
			if (num >= 1 && num <= pending.data.length) {
				clearPendingInteraction(ctx, pending);
				const item = buildSpotifyQueueItem(pending.data[num - 1]);
				session.playback.enqueue(item);
				const dur = item.duration
					? formatTime(item.duration)
					: "Unknown";
				await respond.reply(
					message,
					`Added **${item.title}** by ${item.artist} (${dur}) to queue.`
				);
			}
			return true;
		}

		if (pending.type === "search") {
			const num = Number.parseInt(rawInput, 10);
			if (num >= 1 && num <= pending.data.length) {
				const selected = pending.data[num - 1];
				createPendingInteraction(
					ctx,
					message,
					"mode",
					selected,
					"Mode selection timed out.",
					pending.options || {}
				);
				await respond.reply(
					message,
					`Selected: ${selected.title}\nReply with **1** (Audio) or **2** (Video)`
				);
			}
			return true;
		}

		if (pending.type === "mode") {
			const mode = parseModeInput(rawInput);
			if (!mode) {
				return true;
			}
			clearPendingInteraction(ctx, pending);
			const quality = pending.options?.quality || "auto";
			const item = buildYouTubeQueueItem(pending.data, mode, { quality });
			session.playback.enqueue(item);
			await respond.reply(
				message,
				`Added **${pending.data.title}** (${mode.toUpperCase()}${mode === "video" ? ` [${quality}]` : ""}) to queue.`
			);
			return true;
		}

		if (pending.type === "playlistMode") {
			const mode = parseModeInput(rawInput);
			if (!mode) {
				return true;
			}
			clearPendingInteraction(ctx, pending);
			const quality = pending.options?.quality || "auto";
			const items = pending.data.videos.map((v) =>
				buildYouTubeQueueItem(v, mode, { quality })
			);
			session.playback.enqueueMany(items);
			await respond.reply(
				message,
				`Added ${items.length} tracks (${mode.toUpperCase()}${mode === "video" ? ` [${quality}]` : ""}) to queue.`
			);
			return true;
		}

		return true;
	},
});
