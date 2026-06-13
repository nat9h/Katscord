import { defineCommand } from "#core/plugins/defineCommand";

export default defineCommand({
	name: "delowner",
	aliases: ["ownerdel", "removeowner", "rmowner"],
	category: "system",
	ownerOnly: true,
	help: {
		group: "system",
		usage: "{prefix}{command} <userId>",
		description: "Remove a trusted user",
	},
	args: {
		min: 1,
		schema: [{ name: "userId", type: "userid", required: true }],
	},

	async execute({ ctx, message, namedArgs, respond }) {
		const userId = namedArgs.userId;
		const owners = ctx.getOwnerIds();

		if (!owners.includes(userId)) {
			return respond.reply(message, `Owner not found: \`${userId}\``);
		}
		if (userId === ctx.client.user?.id) {
			return respond.reply(message, "Cannot remove the self account.");
		}

		await ctx.settings.update((draft) => {
			draft.ownerIds = (draft.ownerIds || []).filter(
				(id) => id !== userId
			);
		});

		return respond.reply(
			message,
			`Owner removed: \`${userId}\`\nOwners: ${
				ctx
					.getOwnerIds()
					.map((id) => `\`${id}\``)
					.join(", ") || "-"
			}`
		);
	},
});
