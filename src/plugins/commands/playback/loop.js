import { defineCommand } from "#core/plugins/defineCommand";

export default defineCommand({
	name: "loop",
	category: "playback",
	requiresSession: true,
	help: {
		group: "playback",
		usage: "{prefix}{command}",
		description: "Toggle loop for the current track",
	},

	async execute({ message, session, respond }) {
		const enabled = session.playback.toggleLoopOne();
		return respond.reply(
			message,
			`Loop ${enabled ? "enabled" : "disabled"} for current track.`
		);
	},
});
