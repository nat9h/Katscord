export default {
	kind: "command",
	name: "loop",
	aliases: [],
	help: {
		group: "playback",
		usage: "loop",
		description: "Toggle loop mode for the current track only",
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
		const enabled = session.playback.toggleLoopOne();

		return respond.reply(
			message,
			`Loop ${enabled ? "enabled" : "disabled"} for current track.`
		);
	},
};
