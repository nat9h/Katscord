import { clearPendingInteraction } from "#plugins/playback/state";

export default {
	kind: "command",
	name: "stop",
	aliases: [],
	help: {
		group: "playback",
		usage: "stop",
		description: "Stop playback and clear the current queue",
	},
	failed: "Failed to execute %command: %error",

	async execute({ ctx, message, session, respond, usedPrefix = "!" }) {
		if (!message.guild?.id) {
			return respond.reply(message, "Use this command in a guild.");
		}

		if (!session) {
			return respond.reply(
				message,
				`No session for this guild yet. Use \`${usedPrefix}config bot <voiceChannelId>\` first.`
			);
		}

		clearPendingInteraction(ctx, message);
		await session.playback.stop();
		ctx.setDefaultPresence();

		return respond.reply(message, "Playback stopped.");
	},
};
