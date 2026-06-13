import { defineCommand } from "#core/plugins/defineCommand";

export default defineCommand({
	name: "queueloop",
	category: "playback",
	requiresSession: true,
	help: {
		group: "playback",
		usage: "{prefix}{command}",
		description: "Toggle loop for the whole queue",
	},

	async execute({ message, session, respond }) {
		const enabled = session.playback.toggleLoopAll();
		return respond.reply(
			message,
			`Queue loop ${enabled ? "enabled" : "disabled"}.`
		);
	},
});
