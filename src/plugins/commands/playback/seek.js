import { defineCommand } from "#core/plugins/defineCommand";
import { formatTime, parseTime } from "#utils/time";

export default defineCommand({
	name: "seek",
	category: "playback",
	requiresSession: true,
	help: {
		group: "playback",
		usage: "{prefix}{command} <time>",
		description: "Jump to a specific playback position",
		details: ["Supports: 90, 1:30, 01:02:03, 2m30s"],
	},
	args: { min: 1, usage: "{prefix}{command} <time>" },

	async execute({ message, args = [], session, respond }) {
		const sec = parseTime(args.join(" "));
		if (!Number.isFinite(sec) || sec < 0) {
			return respond.reply(message, "Invalid seek time.");
		}

		const ok = await session.playback.seek(sec);
		return respond.reply(
			message,
			ok ? `Seeked to ${formatTime(sec)}.` : "Nothing is playing."
		);
	},
});
