import { defineCommand } from "#core/plugins/defineCommand";
import {
	PLAYLIST_SUBCOMMANDS,
	renderPlaylistUsage,
} from "#lib/playlist/handlers";

export default defineCommand({
	name: "playlist",
	aliases: ["pl"],
	category: "playlist",
	help: {
		group: "playlist",
		usage: "{prefix}{command} <subcommand> ...",
		description: "Manage saved playlists",
		details: [
			"save <name> — save current queue",
			"load <name> — load into queue",
			"list — show all playlists",
			"show <name> — display contents",
			"add <name> <url/path> — append items",
			"remove <name> <index> — remove item",
			"rename <old> <new> — rename playlist",
			"delete <name> — delete playlist",
		],
	},

	async execute({
		ctx,
		message,
		args = [],
		usedPrefix,
		session,
		respond,
		command,
	}) {
		const sub = String(args.shift() || "").toLowerCase();
		const prefix = usedPrefix + command;

		if (!sub) {
			return respond.reply(message, renderPlaylistUsage(prefix));
		}

		const handler = PLAYLIST_SUBCOMMANDS[sub];
		if (!handler) {
			return respond.reply(message, "Unknown playlist subcommand.");
		}

		return handler({
			ctx,
			message,
			respond,
			session,
			args,
			prefix,
		});
	},
});
