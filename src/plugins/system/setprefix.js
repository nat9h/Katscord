export default {
	kind: "command",
	name: "setprefix",
	aliases: ["prefix"],
	help: {
		group: "system",
		usage: "setprefix <prefix>",
		description: "Set the primary command prefix.",
	},
	failed: "Failed to execute %command: %error",

	async execute({
		ctx,
		message,
		args = [],
		usedPrefix = "!",
		respond,
		command,
	}) {
		const prefix = String(args[0] || "").trim();

		if (!prefix) {
			return respond.reply(
				message,
				`Usage: \`${usedPrefix + command} <prefix>\``
			);
		}

		if (prefix.length > 10) {
			return respond.reply(
				message,
				"Prefix is too long. Max 10 characters."
			);
		}

		await ctx.settings.update((draft) => {
			const oldPrefixes = Array.isArray(draft.prefixes)
				? draft.prefixes
				: ["!"];

			draft.prefixes = [
				prefix,
				...oldPrefixes.filter((item) => item && item !== prefix),
			];
		});

		return respond.reply(
			message,
			`Primary prefix set to \`${prefix}\`\nCurrent prefixes: ${ctx
				.getPrefixes()
				.map((p) => `\`${p}\``)
				.join(", ")}`
		);
	},
};
