import { defineCommand } from "#core/plugins/defineCommand";
import { clearPendingInteraction } from "#plugins/commands/playback/_state";

export default defineCommand({
	name: "stop",
	category: "playback",
	requiresSession: true,
	help: {
		group: "playback",
		usage: "{prefix}{command}",
		description: "Stop playback and clear the queue",
	},

	async execute({ ctx, message, session, respond }) {
		clearPendingInteraction(ctx, message);
		await session.playback.stop();
		ctx.setDefaultPresence();
		return respond.reply(message, "Playback stopped.");
	},
});
