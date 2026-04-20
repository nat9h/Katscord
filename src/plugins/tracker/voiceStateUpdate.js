export default {
	kind: "event",
	name: "voiceStateUpdate",
	priority: 0,

	async execute({ ctx, args }) {
		const [oldState, newState] = args;

		if (oldState.guild?.id !== ctx.guildId) return false;

		const userId = newState.id || oldState.id;
		if (userId === ctx.client.user.id) return false;

		const member = newState.member || oldState.member;
		const username = member?.displayName || "Unknown user";

		if (
			newState.channelId === ctx.voiceChannelId &&
			oldState.channelId !== ctx.voiceChannelId
		) {
			ctx.userJoinTimes.set(userId, Date.now());
			console.log(`[TRACKER] ${username} joined.`);
			return false;
		}

		if (
			oldState.channelId === ctx.voiceChannelId &&
			newState.channelId !== ctx.voiceChannelId
		) {
			const joinTime = ctx.userJoinTimes.get(userId);

			if (joinTime) {
				const diff = Date.now() - joinTime;
				console.log(
					`[TRACKER] ${username} left after ${Math.floor(diff / 60000)}m ${Math.floor((diff % 60000) / 1000)}s.`
				);
				ctx.userJoinTimes.delete(userId);
			}
		}

		return false;
	},
};
