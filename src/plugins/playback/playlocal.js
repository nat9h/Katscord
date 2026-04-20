import {
	buildLocalQueueItem,
	buildLocalQueueItemsFromDirectory,
	isLocalDirectory,
	isLocalFile,
} from "#utils/localMedia";

export default {
	kind: "command",
	name: "playlocal",
	aliases: ["plocal", "localplay"],
	help: {
		group: "playback",
		usage: "playlocal <path|folder> [--recursive] [-audio|-video]",
		description: "Play local file or folder from disk",
		details: [
			"Single file will be added as one queue item",
			"Folder will be loaded as a local playlist",
			"--recursive will scan subfolders too",
			"Duration for local files is read with ffprobe when available",
		],
	},
	failed: "Failed to execute %command: %error",

	async execute({
		ctx,
		message,
		args = [],
		usedPrefix = "!",
		session,
		respond,
	}) {
		if (!message.guild?.id) {
			return respond.reply(message, "Use this command in a guild.");
		}

		if (!session) {
			return respond.reply(
				message,
				`No session for this guild yet. Use \`${usedPrefix}config bot <voiceChannelId>\` first.`
			);
		}

		if (!args.length) {
			return respond.reply(
				message,
				[
					"Usage:",
					`\`${usedPrefix}playlocal <path> [-audio|-video]\``,
					`\`${usedPrefix}playlocal <folder> [-audio|-video]\``,
					`\`${usedPrefix}playlocal <folder> --recursive\``,
				].join("\n")
			);
		}

		const flags = new Set(args.map((arg) => arg.toLowerCase()));

		let forcedMode = null;
		if (flags.has("-video") || flags.has("--video") || flags.has("-v")) {
			forcedMode = "video";
		} else if (
			flags.has("-audio") ||
			flags.has("--audio") ||
			flags.has("-music") ||
			flags.has("--music") ||
			flags.has("-a")
		) {
			forcedMode = "audio";
		}

		const recursive = flags.has("--recursive") || flags.has("-r");

		const pathArgs = args.filter(
			(arg) =>
				!/^-(video|audio|music|v|a|r)$/i.test(arg) &&
				!/^--(video|audio|music|recursive)$/i.test(arg)
		);

		const input = pathArgs.join(" ").trim();

		if (!input) {
			return respond.reply(message, "Local path is required.");
		}

		if (isLocalFile(input)) {
			const queueItem = await buildLocalQueueItem(
				input,
				forcedMode,
				ctx.mediaProbeService
			);

			session.playback.enqueue(queueItem);

			return respond.reply(
				message,
				`Local file added: **${queueItem.title}** as **${queueItem.mode.toUpperCase()}**.`
			);
		}

		if (isLocalDirectory(input)) {
			const items = await buildLocalQueueItemsFromDirectory(
				input,
				forcedMode,
				ctx.mediaProbeService,
				{ recursive }
			);

			if (!items.length) {
				return respond.reply(
					message,
					"No playable media files found in that folder."
				);
			}

			session.playback.enqueueMany(items);

			return respond.reply(
				message,
				`Added **${items.length}** local item(s) from folder as playlist.${recursive ? " (recursive)" : ""}`
			);
		}

		return respond.reply(
			message,
			"Local path not found. Use absolute path or quoted path if it contains spaces."
		);
	},
};
