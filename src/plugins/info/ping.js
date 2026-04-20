export default {
	kind: "command",
	name: "ping",
	aliases: ["latency"],
	help: {
		group: "info",
		usage: "ping",
		description: "Check bot response latency.",
	},
	failed: "Failed to execute %command: %error",

	async execute({ ctx, message, respond }) {
		const sent = await respond.notice(message, "Pinging...");

		const apiPing =
			typeof ctx.client.ws?.ping === "number" ? ctx.client.ws.ping : null;

		const messageLatency =
			sent?.createdTimestamp && message?.createdTimestamp
				? sent.createdTimestamp - message.createdTimestamp
				: null;

		const lines = ["🏓 **Pong!**"];

		if (messageLatency !== null) {
			lines.push(`Message Latency: **${messageLatency}ms**`);
		}

		if (apiPing !== null && Number.isFinite(apiPing)) {
			lines.push(`WebSocket Ping: **${apiPing}ms**`);
		}

		return respond.editOrReply(sent, message, lines.join("\n"), {
			preferReply: false,
		});
	},
};
