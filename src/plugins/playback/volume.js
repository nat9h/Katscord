export default {
	kind: "command",
	name: "volume",
	aliases: ["vol"],
	help: {
		group: "playback",
		usage: "volume [0-200]",
		description: "Show current volume or set a new volume percentage",
	},
	failed: "Failed to execute %command: %error",

	async execute({ message, args = [], session, respond, usedPrefix = "!" }) {
		if (!message.guild?.id) {
			return respond.reply(message, "Use this command in a guild.");
		}

		if (!session) {
			return respond.reply(
				message,
				`No session for this guild yet. Use \`${usedPrefix}config bot <voiceChannelId>\` first.`
			);
		}

		const vol = Number.parseFloat(args[0]);

		if (Number.isNaN(vol)) {
			return respond.reply(
				message,
				`Current Volume: ${Math.round(session.playback.getVolume() * 100)}%`
			);
		}

		const safeVol = session.playback.setVolume(vol);

		return respond.reply(
			message,
			`Volume set to ${safeVol}%. (Applied on next playback / seek / resume)`
		);
	},
};
