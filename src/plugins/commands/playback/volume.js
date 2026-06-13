import { defineCommand } from "#core/plugins/defineCommand";

export default defineCommand({
	name: "volume",
	aliases: ["vol"],
	category: "playback",
	requiresSession: true,
	help: {
		group: "playback",
		usage: "{prefix}{command} [0-200]",
		description: "Show or set volume percentage",
	},

	async execute({ message, args = [], session, respond }) {
		const raw = args[0];

		if (raw === undefined || raw === "") {
			return respond.reply(
				message,
				`Current Volume: ${Math.round(session.playback.getVolume() * 100)}%`
			);
		}

		const vol = Number.parseFloat(raw);
		if (!Number.isFinite(vol)) {
			return respond.reply(
				message,
				"Volume must be a number between 0 and 200."
			);
		}

		const safeVol = session.playback.setVolume(vol);
		return respond.reply(
			message,
			`Volume set to ${safeVol}%. (Applied on next playback/seek/resume)`
		);
	},
});
