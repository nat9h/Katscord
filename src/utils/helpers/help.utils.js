const DEFAULT_PREFIX = "!";

function readPrefixes(ctx) {
	if (typeof ctx?.getPrefixes === "function") {
		const result = ctx.getPrefixes();
		if (Array.isArray(result) && result.length > 0) {
			return result;
		}
	}

	if (Array.isArray(ctx?.prefixes) && ctx.prefixes.length > 0) {
		return ctx.prefixes;
	}

	return [DEFAULT_PREFIX];
}

export function getPrimaryPrefix(ctx, usedPrefix) {
	if (usedPrefix && !String(usedPrefix).startsWith("<@")) {
		return usedPrefix;
	}

	return readPrefixes(ctx)[0] || DEFAULT_PREFIX;
}

export function getPrefixesLabel(ctx, usedPrefix) {
	const prefixes = readPrefixes(ctx);

	if (usedPrefix && !String(usedPrefix).startsWith("<@")) {
		const merged = [
			usedPrefix,
			...prefixes.filter((prefix) => prefix !== usedPrefix),
		];
		return merged.map((prefix) => `\`${prefix}\``).join(", ");
	}

	return prefixes.map((prefix) => `\`${prefix}\``).join(", ");
}

export function toTitleCase(input) {
	return String(input || "")
		.replace(/[-_]/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function truncate(text, maxLength = 60) {
	const value = String(text || "").trim();
	if (!value) return "-";
	if (value.length <= maxLength) return value;
	return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

export function formatCommandUsage(prefix, command) {
	const usage = command?.help?.usage || command?.name || "unknown";
	return `\`${prefix}${usage}\``;
}

export function formatAliases(prefix, aliases = []) {
	if (!Array.isArray(aliases) || aliases.length === 0) return "-";
	return aliases.map((alias) => `\`${prefix}${alias}\``).join(", ");
}

export function groupCommands(commands) {
	const groups = new Map();

	for (const command of commands) {
		const rawGroup = command?.help?.group || command?.__folder || "misc";
		const groupName = toTitleCase(rawGroup);

		if (!groups.has(groupName)) groups.set(groupName, []);
		groups.get(groupName).push(command);
	}

	return groups;
}

export function splitMessage(text, maxLength = 1900) {
	if (text.length <= maxLength) return [text];

	const chunks = [];
	let current = "";
	const sections = text.split("\n\n");

	for (const section of sections) {
		const candidate = current ? `${current}\n\n${section}` : section;

		if (candidate.length <= maxLength) {
			current = candidate;
			continue;
		}

		if (current) {
			chunks.push(current);
			current = "";
		}

		if (section.length <= maxLength) {
			current = section;
			continue;
		}

		for (const line of section.split("\n")) {
			const lineCandidate = current ? `${current}\n${line}` : line;

			if (lineCandidate.length <= maxLength) {
				current = lineCandidate;
				continue;
			}

			if (current) chunks.push(current);
			current = line;
		}
	}

	if (current) chunks.push(current);
	return chunks;
}
