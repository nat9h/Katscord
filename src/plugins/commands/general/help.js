import { defineCommand } from "#core/plugins/defineCommand";
import { renderCommandHelp } from "#utils/helpers/renderCommandHelp";
import { splitMessage } from "#utils/text/splitMessage";

function toLabel(name) {
	const raw = String(name || "").trim();
	if (!raw) {
		return "Misc";
	}
	return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function sortCategories(categories) {
	return [...categories].sort((a, b) =>
		toLabel(a.name).localeCompare(toLabel(b.name))
	);
}

export default defineCommand({
	name: "help",
	aliases: ["h", "menu", "commands"],
	category: "general",
	help: {
		group: "general",
		description: "Show command list or detailed help for one command",
		usage: "{prefix}{command} [command]",
	},
	args: {
		min: 0,
		max: 1,
		schema: [{ name: "command", type: "string", required: false }],
	},

	async execute({ respond, message, pluginManager, namedArgs, usedPrefix }) {
		const query = namedArgs.command;

		if (query) {
			const command = pluginManager.resolveCommand(query);
			if (!command) {
				return respond.reply(message, `Command not found: ${query}`);
			}
			return respond.reply(
				message,
				renderCommandHelp(command, { prefix: usedPrefix })
			);
		}

		const categories = sortCategories(pluginManager.getCommandCategories());
		if (!categories.length) {
			return respond.reply(message, "No commands available.");
		}

		const total = categories.reduce(
			(sum, cat) => sum + cat.commands.length,
			0
		);

		const lines = [
			"## Katsucord Selfbot",
			`-# Use \`${usedPrefix}help <command>\` for detailed info on any command.`,
			"",
		];

		for (const category of categories) {
			const label = toLabel(category.name);
			lines.push(`### ${label} \`(${category.commands.length})\``);

			for (const cmd of category.commands) {
				const desc = cmd.help?.description || "No description.";
				lines.push(`> \`${usedPrefix}${cmd.name}\` — ${desc}`);
			}

			lines.push("");
		}

		lines.push(
			`-# Total: **${total}** commands across **${categories.length}** categories.`
		);

		const chunks = splitMessage(lines.join("\n"), 1900);
		let last = await respond.reply(message, chunks[0]);
		for (const chunk of chunks.slice(1)) {
			last = await message.channel.send(chunk);
		}
		return last;
	},
});
