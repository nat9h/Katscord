export default {
	kind: "command",
	name: "delowner",
	aliases: ["ownerdel", "removeowner", "rmowner"],
	help: {
		group: "system",
		usage: "delowner <userId>",
		description: "Remove a user account from owner list.",
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

		const owners = ctx.getOwnerIds();
		if (!owners.includes(userId)) {
			return respond.reply(message, `Owner not found: \`${userId}\``);
		}

		const selfId = ctx.client.user?.id;
		if (userId === selfId) {
			return respond.reply(
				message,
				"You cannot remove the self account from trusted owners."
			);
		}

		await ctx.settings.update((draft) => {
			const currentOwners = Array.isArray(draft.ownerIds)
				? draft.ownerIds
				: [];
			draft.ownerIds = currentOwners.filter((id) => id !== userId);
		});

		const updatedOwners = ctx.getOwnerIds();

		return respond.reply(
			message,
			`Owner removed: \`${userId}\`\nOwners: ${
				updatedOwners.length
					? updatedOwners.map((id) => `\`${id}\``).join(", ")
					: "-"
			}`
		);
	},
};
