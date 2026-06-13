import { defineCommand } from "#core/plugins/defineCommand";

export default defineCommand({
	name: "resume",
	category: "playback",
	requiresSession: true,
	help: {
		group: "playback",
		usage: "{prefix}{command}",
		description: "Resume paused playback",
	},

	async execute({ message, session, respond }) {
		const ok = await session.playback.resume();
		return respond.reply(
			message,
			ok ? "Resuming playback..." : "Nothing to resume."
		);
	},
});
