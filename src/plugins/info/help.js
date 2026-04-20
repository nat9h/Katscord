import {
	renderCommandDetails,
	renderHelpOverview,
} from "#utils/helpers/help.renderer";
import { splitMessage } from "#utils/helpers/help.utils";

export default {
	kind: "command",
	name: "help",
	aliases: ["menu", "commands"],
	help: {
		group: "info",
		usage: "help [command]",
		description: "Show command list or command details",
	},
	failed: "Failed to execute %command: %error",

	async execute({
		ctx,
		message,
		args = [],
		pluginManager,
		usedPrefix = "!",
		respond,
	}) {
		const manager = pluginManager || ctx.pluginManager;

		if (!manager) {
			return respond.reply(message, "Help is not ready yet.", {
				preferReply: false,
			});
		}

		const query = args.join(" ").trim().toLowerCase();

		const output = query
			? renderCommandDetails(ctx, manager, query, usedPrefix)
			: renderHelpOverview(ctx, manager, usedPrefix);

		const chunks = splitMessage(output, 1900);

		if (chunks.length === 0) {
			return null;
		}

		let lastMessage = await respond.reply(message, chunks[0], {
			preferReply: false,
		});

		for (const chunk of chunks.slice(1)) {
			lastMessage = await message.channel.send(chunk);
		}

		return lastMessage;
	},
};
