import { formatPermissions } from "#utils/helpers/permissions";

function toLabel(name) {
	const raw = String(name || "").trim();
	if (!raw) {
		return "Misc";
	}
	return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function renderUsage(plugin, prefix) {
	const command = String(plugin?.name || "");
	const alias =
		Array.isArray(plugin?.aliases) && plugin.aliases.length > 0
			? plugin.aliases[0]
			: command;

	const template =
		plugin?.args?.usage || plugin?.help?.usage || "{prefix}{command}";

	let rendered = String(template)
		.replace(/\{prefix\}/g, prefix)
		.replace(/\{command\}/g, command)
		.replace(/\{alias\}/g, alias);

	const schema = plugin?.args?.schema;
	const hasSchemaInTemplate = /[<[]/.test(template);

	if (Array.isArray(schema) && schema.length > 0 && !hasSchemaInTemplate) {
		const parts = schema.map((field) => {
			const name = field?.name || "arg";
			const wrap = field?.required === false ? ["[", "]"] : ["<", ">"];
			const suffix = field?.rest ? "..." : "";
			return `${wrap[0]}${name}${suffix}${wrap[1]}`;
		});
		rendered = `${rendered} ${parts.join(" ")}`.trim();
	}

	return rendered;
}

function renderArgumentLines(plugin) {
	const schema = plugin?.args?.schema;
	if (!Array.isArray(schema) || schema.length === 0) {
		return [];
	}

	return schema.map((field) => {
		const name = field?.name || "arg";
		const type = String(field?.type || "string").toLowerCase();
		const required = field?.required === false ? "optional" : "required";

		const tags = [type, required];
		if (field?.rest) {
			tags.push("rest");
		}
		if (field?.default !== undefined) {
			tags.push(`default: ${JSON.stringify(field.default)}`);
		}
		if (Array.isArray(field?.choices) && field.choices.length > 0) {
			tags.push(`choices: ${field.choices.join(" | ")}`);
		}

		const description = field?.description ? ` — ${field.description}` : "";

		return `> \`${name}\` \`(${tags.join(" · ")})\`${description}`;
	});
}

function renderRestrictions(plugin) {
	const flags = [];
	if (plugin.ownerOnly) {
		flags.push("Owner only");
	}
	if (plugin.guildOnly) {
		flags.push("Guild only");
	}
	if (plugin.privateOnly) {
		flags.push("DM only");
	}
	if (plugin.voiceOnly) {
		const sameChannel =
			typeof plugin.voiceOnly === "object" &&
			plugin.voiceOnly?.sameChannel;
		flags.push(sameChannel ? "Same voice channel" : "Voice only");
	}
	if (plugin.requiresSession) {
		flags.push("Requires session");
	}
	return flags;
}

export function renderCommandHelp(plugin, options = {}) {
	const prefix = String(options.prefix || "!");
	const category =
		plugin.category ||
		plugin.help?.group ||
		plugin.meta?.category ||
		"general";
	const cooldownSec = Number(plugin?.cooldown?.seconds || 0);
	const cooldownScope = plugin?.cooldown?.scope || "user";
	const description = plugin.help?.description || "No description provided.";

	const aliases =
		Array.isArray(plugin.aliases) && plugin.aliases.length > 0
			? plugin.aliases.map((a) => `\`${prefix}${a}\``).join(" ")
			: null;

	const restrictions = renderRestrictions(plugin);
	const argLines = renderArgumentLines(plugin);

	const lines = [
		`## \`${prefix}${plugin.name}\``,
		`-# ${description}`,
		"### Usage",
		"```",
		renderUsage(plugin, prefix),
		"```",
	];

	const meta = [];
	meta.push(`> **Category:** \`${toLabel(category)}\``);
	if (aliases) {
		meta.push(`> **Aliases:** ${aliases}`);
	}
	meta.push(
		`> **Cooldown:** ${cooldownSec > 0 ? `\`${cooldownSec}s\` (per ${cooldownScope})` : "`None`"}`
	);
	if (restrictions.length > 0) {
		meta.push(`> **Restrictions:** ${restrictions.join(" · ")}`);
	}
	if (plugin.permissions?.length > 0) {
		meta.push(
			`> **Permissions:** ${formatPermissions(plugin.permissions)}`
		);
	}
	if (plugin.clientPermissions?.length > 0) {
		meta.push(
			`> **Client perms:** ${formatPermissions(plugin.clientPermissions)}`
		);
	}

	lines.push("", "### Info", ...meta);

	if (argLines.length > 0) {
		lines.push("", "### Arguments", ...argLines);
	}

	if (Array.isArray(plugin.help?.details) && plugin.help.details.length > 0) {
		lines.push("", "### Details");
		for (const detail of plugin.help.details) {
			lines.push(`> ${detail}`);
		}
	}

	if (
		Array.isArray(plugin.help?.examples) &&
		plugin.help.examples.length > 0
	) {
		lines.push("", "### Examples");
		for (const example of plugin.help.examples) {
			lines.push(`> \`${prefix}${example}\``);
		}
	}

	return lines.join("\n");
}
