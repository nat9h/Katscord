export default {
	kind: "command",
	name: "resume",
	aliases: [],
	help: {
		group: "playback",
		usage: "resume",
		description: "Resume paused playback from the last saved position",
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

		const ok = await session.playback.resume();

		return respond.reply(
			message,
			ok ? "Resuming playback..." : "Nothing to resume."
		);
	},
};
