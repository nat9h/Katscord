import { defineCommand } from "#core/plugins/defineCommand";

export default defineCommand({
	name: "shutdown",
	aliases: ["die"],
	category: "general",
	ownerOnly: true,
	cooldown: { seconds: 10, scope: "global" },
	help: {
		group: "general",
		description: "Shut down the bot process",
		usage: "{prefix}{command}",
	},

	async execute({ respond, message }) {
		await respond.reply(message, "Shutting down...");
		process.kill(process.pid, "SIGTERM");
		return true;
	},
});
