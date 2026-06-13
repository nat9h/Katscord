import { defineCommand } from "#core/plugins/defineCommand";
import { chatex } from "#lib/scraper/chatex";
import { splitMessage } from "#utils/text/splitMessage";

export default defineCommand({
	name: "ai",
	aliases: ["ask", "chatex"],
	category: "ai",
	cooldown: { seconds: 5, scope: "user" },
	help: {
		group: "ai",
		usage: "{prefix}{command} <prompt>",
		description: "Ask Chatex AI",
	},
	args: {
		min: 1,
		schema: [
			{ name: "prompt", type: "string", required: true, rest: true },
		],
	},

	async execute({ message, respond, namedArgs }) {
		const prompt = String(namedArgs.prompt || "").trim();
		const loading = await respond.reply(message, "Thinking...");
		const result = await chatex(prompt);

		const text = result?.response?.text?.trim() || "";
		const errors = Array.isArray(result?.errors) ? result.errors : [];

		if (!text) {
			const errorText =
				errors.length > 0
					? errors.map((e) => `• ${e.step}: ${e.message}`).join("\n")
					: "No response returned.";
			return respond.editOrReply(
				loading,
				message,
				`Chatex failed.\n${errorText}`
			);
		}

		const footer =
			errors.length > 0 ? `\n\n-# warnings: ${errors.length}` : "";
		const chunks = splitMessage(`${text}${footer}`, 1900);

		if (!chunks.length) {
			return respond.editOrReply(loading, message, "No response.");
		}

		let last = await respond.editOrReply(loading, message, chunks[0]);
		for (const chunk of chunks.slice(1)) {
			last = await message.channel.send(chunk);
		}
		return last;
	},
});
