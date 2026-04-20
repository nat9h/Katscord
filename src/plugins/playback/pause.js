import { formatTime } from "#utils/time";

export default {
	kind: "command",
	name: "pause",
	aliases: [],
	help: {
		group: "playback",
		usage: "pause",
		description: "Pause the current playback and save its position",
	},
	failed: "Failed to execute %command: %error",

	async execute({ message, session, respond }) {
		if (!message.guild?.id) {
			return respond.reply(message, "Use this command in a guild.");
		}

		if (!session) {
			return respond.reply(
				message,
				"No session for this guild yet. Use `config bot <voiceChannelId>` first."
			);
		}

		const ok = await session.playback.pause();

		if (!ok) {
			return respond.reply(message, "Nothing is playing.");
		}

		const position = session.playback.getSeekSeconds();

		return respond.reply(
			message,
			`Playback paused at ${formatTime(position)}.`
		);
	},
};
