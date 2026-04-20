import { chatex } from "#lib/scraper/chatex";
import { splitMessage } from "#utils/helpers/help.utils";

export default {
	kind: "command",
	name: "ai",
	aliases: ["ask", "chatex"],
	help: {
		group: "ai",
		usage: "ai <prompt>",
		description: "Ask Chatex AI.",
	},
	failed: "Failed to execute %command: %error",

	async execute({ message, args = [], usedPrefix = "!", command, respond }) {
		const prompt = args.join(" ").trim();

		if (!prompt) {
			return respond.reply(
				message,
				`Usage: \`${usedPrefix + command} <prompt>\``
			);
		}

		const loading = await respond.notice(message, "Thinking...");
		const result = await chatex(prompt);

		const text = result?.response?.text?.trim() || "";
		const errors = Array.isArray(result?.errors) ? result.errors : [];

		if (!text) {
			const errorText =
				errors.length > 0
					? errors
							.map((error) => `• ${error.step}: ${error.message}`)
							.join("\n")
					: "No text response returned.";

			return respond.editOrReply(
				loading,
				message,
				`Chatex failed.\n${errorText}`,
				{ preferReply: false }
			);
		}

		const footer =
			errors.length > 0 ? `\n\n-# warnings: ${errors.length}` : "";

		const chunks = splitMessage(`${text}${footer}`, 1900);

		if (chunks.length === 0) {
			return respond.editOrReply(
				loading,
				message,
				"No text response returned.",
				{ preferReply: false }
			);
		}

		let lastMessage = await respond.editOrReply(
			loading,
			message,
			chunks[0],
			{ preferReply: false }
		);

		for (const chunk of chunks.slice(1)) {
			lastMessage = await message.channel.send(chunk);
		}

		return lastMessage;
	},
};
