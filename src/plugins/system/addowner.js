export default {
	kind: "command",
	name: "addowner",
	aliases: ["owneradd"],
	help: {
		group: "system",
		usage: "addowner <userId>",
		description: "Allow another user account to use commands.",
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
		const userId = ctx.normalizeId(args[0]) || null;

		if (!userId) {
			return respond.reply(
				message,
				`Usage: \`${usedPrefix + command} <userId>\``
			);
		}

		await ctx.settings.update((draft) => {
			const owners = Array.isArray(draft.ownerIds) ? draft.ownerIds : [];
			draft.ownerIds = [...new Set([...owners, userId])];
		});

		return respond.reply(
			message,
			`Owner added: \`${userId}\`\nOwners: ${
				ctx
					.getOwnerIds()
					.map((id) => `\`${id}\``)
					.join(", ") || "-"
			}`
		);
	},
};
