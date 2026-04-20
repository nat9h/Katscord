import { formatTime, parseTime } from "#utils/time";

export default {
	kind: "command",
	name: "seek",
	aliases: [],
	help: {
		group: "playback",
		usage: "seek <time>",
		description: "Jump to a specific playback position",
		details: ["Supports formats like 90, 1:30, 01:02:03, or 2m30s"],
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
};
