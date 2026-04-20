import {
	formatAliases,
	formatCommandUsage,
	getPrefixesLabel,
	getPrimaryPrefix,
	groupCommands,
	toTitleCase,
	truncate,
} from "#utils/helpers/help.utils";

function getLoopLabel(playback) {
	if (!playback) return "off";
	if (playback.loopOne) return "track";
	if (playback.loopAll) return "queue";
	return "off";
}

function getPlayerMode(playback) {
	const current = playback?.getCurrent?.();

	if (!current) {
		return playback?.paused ? "paused" : "idle";
	}

	if (playback?.paused) {
		return `paused ${current.mode || "audio"}`;
	}

	return current.mode || "audio";
}

export function renderStatus(ctx, usedPrefix) {
	const playback = ctx?.playback;
	const current = playback?.getCurrent?.() || null;
	const queue = playback?.getQueue?.() || [];
	const volume = playback?.getVolume
		? Math.round(playback.getVolume() * 100)
		: 100;

	const currentTitle = current
		? current.artist
			? `${current.artist} - ${current.title}`
			: current.title
		: "Nothing is playing";

	return [
		"**Status**",
		`• prefixes: ${getPrefixesLabel(ctx, usedPrefix)}`,
		`• player: **${getPlayerMode(playback)}**`,
		`• volume: **${volume}%**`,
		`• loop: **${getLoopLabel(playback)}**`,
		`• queue: **${queue.length}** item(s)`,
		`• current: ${truncate(currentTitle, 70)}`,
		"• audio = no share screen",
		"• video = go-live / share screen",
	].join("\n");
}

export function renderHelpOverview(ctx, pluginManager, usedPrefix) {
	const prefix = getPrimaryPrefix(ctx, usedPrefix);
	const commands = pluginManager.getHelpCommands();
	const grouped = groupCommands(commands);

	const lines = [
		"# **Katsucord Selfbot**",
		`Use ${formatCommandUsage(prefix, { help: { usage: "help <command>" } })} for details.`,
		`Loaded commands: **${commands.length}**`,
		"",
	];

	for (const [groupName, items] of grouped.entries()) {
		lines.push(`**${groupName}**`);

		for (const command of items) {
			const description = command?.help?.description || "No description";
			lines.push(
				`• ${formatCommandUsage(prefix, command)} — ${description}`
			);
		}

		lines.push("");
	}

	lines.push(renderStatus(ctx, usedPrefix));
	lines.push("");
	lines.push("github: https://github.com/nat9h");

	return lines.join("\n").trim();
}

export function renderCommandDetails(ctx, pluginManager, query, usedPrefix) {
	const prefix = getPrimaryPrefix(ctx, usedPrefix);
	const command = pluginManager.resolveCommand(query);

	if (!command) {
		return [
			`Command \`${query}\` not found.`,
			`Use ${formatCommandUsage(prefix, { help: { usage: "help" } })} to see all commands.`,
		].join("\n");
	}

	const groupName = toTitleCase(
		command?.help?.group || command?.__folder || "misc"
	);

	return [
		`**Command: ${command.name}**`,
		`• group: **${groupName}**`,
		`• usage: ${formatCommandUsage(prefix, command)}`,
		`• aliases: ${formatAliases(prefix, command.aliases)}`,
		`• description: ${command?.help?.description || "No description"}`,
	].join("\n");
}
