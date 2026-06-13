import { defineCommand } from "#core/plugins/defineCommand";

export default defineCommand({
	name: "addowner",
	aliases: ["owneradd"],
	category: "system",
	ownerOnly: true,
	help: {
		group: "system",
		usage: "{prefix}{command} <userId>",
		description: "Add a trusted user",
	},
	args: {
		min: 1,
		schema: [{ name: "userId", type: "userid", required: true }],
	},

	async execute({ ctx, message, namedArgs, respond }) {
		const userId = namedArgs.userId;

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
});
