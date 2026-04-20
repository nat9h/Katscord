export default {
	kind: "command",
	name: "queueloop",
	aliases: [],
	help: {
		group: "playback",
		usage: "queueloop",
		description: "Toggle loop mode for the whole queue",
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

		const enabled = session.playback.toggleLoopAll();

		return respond.reply(
			message,
			`Queue loop ${enabled ? "enabled" : "disabled"}.`
		);
	},
};
