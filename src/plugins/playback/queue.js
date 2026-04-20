import { formatTime } from "#utils/time";

export default {
	kind: "command",
	name: "queue",
	aliases: ["q"],
	help: {
		group: "playback",
		usage: "queue",
		description: "Show or refresh the now playing and queue panel",
		details: ["Displays current track and upcoming queue items"],
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

		const current = session.playback.getCurrent();
		const queue = session.playback.getQueue();

		if (!current && queue.length === 0) {
			return respond.reply(message, "Queue is empty.");
		}

		const nowPlaying = current
			? [
					"# **Now Playing**",
					`Title : **${current.title}**`,
					`Mode  : **${String(current.mode || "audio").toUpperCase()}**`,
					`Time  : **${current.duration ? formatTime(current.duration) : "Unknown"}**`,
					current.artist ? `Artist: **${current.artist}**` : null,
				]
					.filter(Boolean)
					.join("\n")
			: "# **Now Playing**\n_Nothing is playing right now._";

		const queueLines =
			queue.length > 0
				? queue
						.slice(0, 10)
						.map((item, index) => {
							const duration = item.duration
								? formatTime(item.duration)
								: "Unknown";

							return `**${index + 1}.** ${item.title} \`[${String(item.mode || "audio").toUpperCase()} | ${duration}]\``;
						})
						.join("\n")
				: "_No upcoming tracks._";

		const extra =
			queue.length > 10
				? `\n\n...and **${queue.length - 10}** more track(s).`
				: "";

		return respond.notice(
			message,
			`${nowPlaying}\n\n**Queue List**\n${queueLines}${extra}`
		);
	},
};
