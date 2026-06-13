import { defineEvent } from "#core/plugins/defineEvent";

export default defineEvent({
	name: "ready",
	priority: 0,

	async execute({ ctx }) {
		ctx.logger?.log?.(`Logged in as ${ctx.client.user?.tag || "unknown"}`);
		ctx.setDefaultPresence();

		const sessions = ctx.sessionManager?.listSessions?.() || [];
		if (!sessions.length) {
			ctx.logger?.log?.("No configured guild sessions to auto-join.");
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
				ctx.logger?.log?.(
					`Joined voice: ${target.guildId} -> ${target.voiceChannelId}`
				);
			} catch (error) {
				ctx.logger?.error?.(
					`Failed to join voice for ${target.guildId}:`,
					error
				);
			}
		}

		return false;
	},
});
