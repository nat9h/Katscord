import {
	buildSpotifyQueueItem,
	buildYouTubeQueueItem,
	clearPendingInteraction,
	createPendingInteraction,
	getPendingInteraction,
	isPendingInputMessage,
	parseModeInput,
} from "#plugins/playback/state";
import { formatTime } from "#utils/time";

function resolvePendingSession(ctx, message, pending) {
	const guildId = pending?.guildId || message.guild?.id || null;
	if (!guildId) return null;

	return (
		ctx.sessionManager?.getSession?.(guildId) ||
		ctx.sessionManager?.ensureSession?.(guildId) ||
		null
	);
}

export default {
	kind: "event",
	name: "messageCreate",
	priority: 100,

	async execute({ ctx, args, respond }) {
		const [message] = args;

		if (!message?.author?.id) return false;
		if (!ctx.isTrustedAuthor?.(message.author.id)) return false;

		const pending = getPendingInteraction(ctx, message);
		if (!pending) return false;

		const session = resolvePendingSession(ctx, message, pending);

		if (!session) {
			clearPendingInteraction(ctx, pending);

			await respond.reply(
				message,
				"No active session for this guild. Use `config bot <voiceChannelId>` first."
			);

			return true;
		}

		const content = message.content.trim();
		const rawInput = content.toLowerCase();

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
				const selected = pending.data[num - 1];
				clearPendingInteraction(ctx, pending);

				const queueItem = buildSpotifyQueueItem(selected);
				session.playback.enqueue(queueItem);

				const durationText = queueItem.duration
					? formatTime(queueItem.duration)
					: "Unknown";

				await respond.reply(
					message,
					`Added **${queueItem.title}** by ${queueItem.artist} (${durationText}) to queue.`
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
					"Mode selection timed out."
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
			if (!mode) return true;

			const item = pending.data;
			clearPendingInteraction(ctx, pending);

			const queueItem = buildYouTubeQueueItem(item, mode);
			session.playback.enqueue(queueItem);

			await respond.reply(
				message,
				`Added **${item.title}** (${mode.toUpperCase()}) to queue.`
			);

			return true;
		}

		if (pending.type === "playlistMode") {
			const mode = parseModeInput(rawInput);
			if (!mode) return true;

			const playlistData = pending.data;
			clearPendingInteraction(ctx, pending);

			const items = playlistData.videos.map((video) =>
				buildYouTubeQueueItem(video, mode)
			);

			session.playback.enqueueMany(items);

			await respond.reply(
				message,
				`Added ${items.length} tracks from playlist (${mode.toUpperCase()} mode) to queue.`
			);

			return true;
		}

		return true;
	},
};
