export default {
	kind: "event",
	name: "ready",
	priority: 0,

	async execute({ ctx }) {
		console.log(`Logged in as ${ctx.client.user.tag}`);
		ctx.setDefaultPresence();

		const sessions = ctx.sessionManager?.listSessions?.() || [];

		if (sessions.length === 0) {
			console.log("No configured guild sessions to auto-join.");
			return false;
		}

		for (const session of sessions) {
			const target = session.getTarget?.();

			if (!target?.guildId || !target?.voiceChannelId) {
				continue;
			}

			try {
				await session.streamer.joinVoice(
					target.guildId,
					target.voiceChannelId
				);

				console.log(
					`Joined voice for guild ${target.guildId} -> ${target.voiceChannelId}`
				);
			} catch (error) {
				console.error(
					`Failed to join voice for guild ${target.guildId}:`,
					error
				);
			}
		}

		return false;
	},
};
