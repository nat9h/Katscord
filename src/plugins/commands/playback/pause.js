import { defineCommand } from "#core/plugins/defineCommand";
import { formatTime } from "#utils/time";

export default defineCommand({
	name: "pause",
	category: "playback",
	requiresSession: true,
	help: {
		group: "playback",
		usage: "{prefix}{command}",
		description: "Pause the current playback",
	},

	async execute({ message, session, respond }) {
		const ok = await session.playback.pause();
		if (!ok) {
			return respond.reply(message, "Nothing is playing.");
		}

		return respond.reply(
			message,
			`Playback paused at ${formatTime(session.playback.getSeekSeconds())}.`
		);
	},
});
