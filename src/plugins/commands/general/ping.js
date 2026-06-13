import { defineCommand } from "#core/plugins/defineCommand";

export default defineCommand({
	name: "ping",
	aliases: ["pong"],
	category: "general",
	help: {
		group: "general",
		description: "Check if the bot is alive",
		usage: "{prefix}{command}",
	},

	async execute({ ctx, respond, message }) {
		const sent = await respond.notice(message, "Pinging...");

		const apiPing =
			typeof ctx.client.ws?.ping === "number" ? ctx.client.ws.ping : null;
		const msgLatency =
			sent?.createdTimestamp && message?.createdTimestamp
				? sent.createdTimestamp - message.createdTimestamp
				: null;

		const lines = ["🏓 **Pong!**"];
		if (msgLatency !== null) {
			lines.push(`Message Latency: **${msgLatency}ms**`);
		}
		if (apiPing !== null && Number.isFinite(apiPing)) {
			lines.push(`WebSocket Ping: **${apiPing}ms**`);
		}

		return respond.editOrReply(sent, message, lines.join("\n"), {
			preferReply: false,
		});
	},
});
