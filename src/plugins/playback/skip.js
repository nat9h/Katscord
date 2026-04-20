export default {
	kind: "command",
	name: "skip",
	aliases: ["next"],
	help: {
		group: "playback",
		usage: "skip",
		description:
			"Skip the current track and continue to the next queue item",
	},
	failed: "Failed to execute %command: %error",

	async execute({ message, session, respond, usedPrefix = "!" }) {
		if (!message.guild?.id) {
			return respond.reply(message, "Use this command in a guild.");
		}

		if (!session) {
			return respond.reply(
				message,
				`No session for this guild yet. Use \`${usedPrefix}config bot <voiceChannelId>\` first.`
			);
		}

		const ok = await session.playback.skip();

		return respond.reply(
			message,
			ok ? "Skipped to next track." : "Nothing is playing."
		);
	},
};
