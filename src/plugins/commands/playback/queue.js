import { defineCommand } from "#core/plugins/defineCommand";
import { formatTime } from "#utils/time";

export default defineCommand({
	name: "queue",
	aliases: ["q"],
	category: "playback",
	requiresSession: true,
	help: {
		group: "playback",
		usage: "{prefix}{command}",
		description: "Show the current queue",
	},

	async execute({ message, session, respond }) {
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
						.map((item, i) => {
							const dur = item.duration
								? formatTime(item.duration)
								: "Unknown";
							return `**${i + 1}.** ${item.title} \`[${String(item.mode || "audio").toUpperCase()} | ${dur}]\``;
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
});
