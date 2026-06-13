import { defineCommand } from "#core/plugins/defineCommand";

export default defineCommand({
	name: "setprefix",
	aliases: ["prefix"],
	category: "system",
	ownerOnly: true,
	help: {
		group: "system",
		usage: "{prefix}{command} <prefix>",
		description: "Set the primary command prefix",
	},
	args: {
		min: 1,
		schema: [{ name: "prefix", type: "string", required: true }],
	},

	async execute({ ctx, message, namedArgs, respond }) {
		const prefix = namedArgs.prefix;
		if (prefix.length > 10) {
			return respond.reply(
				message,
				"Prefix too long. Max 10 characters."
			);
		}

		await ctx.settings.update((draft) => {
			const old = Array.isArray(draft.prefixes) ? draft.prefixes : ["!"];
			draft.prefixes = [prefix, ...old.filter((p) => p && p !== prefix)];
		});

		return respond.reply(
			message,
			`Primary prefix set to \`${prefix}\`\nPrefixes: ${ctx
				.getPrefixes()
				.map((p) => `\`${p}\``)
				.join(", ")}`
		);
	},
});
