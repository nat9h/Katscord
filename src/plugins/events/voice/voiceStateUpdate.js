import { defineEvent } from "#core/plugins/defineEvent";
import { formatDuration } from "#utils/text/format";

export default defineEvent({
	name: "voiceStateUpdate",
	priority: 0,

	async execute({ ctx, args }) {
		const [oldState, newState] = args;
		const guildId = newState.guild?.id || oldState.guild?.id;
		if (!guildId) {
			return false;
		}

		const target = ctx.getGuildTarget(guildId);
		const trackedVc = target?.voiceChannelId;
		if (!trackedVc) {
			return false;
		}

		const userId = newState.id || oldState.id;
		if (!userId || userId === ctx.client.user?.id) {
			return false;
		}

		const member = newState.member || oldState.member;
		const username =
			member?.displayName || member?.user?.username || "Unknown";

		// User joined tracked channel
		if (
			newState.channelId === trackedVc &&
			oldState.channelId !== trackedVc
		) {
			ctx.userJoinTimes.set(`${guildId}:${userId}`, Date.now());
			ctx.logger?.log?.(`[TRACKER] ${username} joined.`);
			return false;
		}

		// User left tracked channel
		if (
			oldState.channelId === trackedVc &&
			newState.channelId !== trackedVc
		) {
			const key = `${guildId}:${userId}`;
			const joinTime = ctx.userJoinTimes.get(key);
			if (joinTime) {
				ctx.logger?.log?.(
					`[TRACKER] ${username} left after ${formatDuration(Date.now() - joinTime)}.`
				);
				ctx.userJoinTimes.delete(key);
			}
		}

		return false;
	},
});
