import { defineCommand } from "#core/plugins/defineCommand";

export default defineCommand({
	name: "skip",
	aliases: ["next"],
	category: "playback",
	requiresSession: true,
	help: {
		group: "playback",
		usage: "{prefix}{command}",
		description: "Skip to the next track",
	},

	async execute({ message, session, respond }) {
		const ok = await session.playback.skip();
		return respond.reply(
			message,
			ok ? "Skipped to next track." : "Nothing is playing."
		);
	},
});
