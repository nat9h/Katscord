import { defineCommand } from "#core/plugins/defineCommand";

export default defineCommand({
	name: "config",
	aliases: ["cfg"],
	category: "system",
	help: {
		group: "system",
		usage: "{prefix}{command} <show|showall|bot|remove> [args]",
		description: "Manage per-guild voice/text targets",
	},

	async execute({ ctx, message, args = [], usedPrefix, respond, command }) {
		const sub = String(args.shift() || "show").toLowerCase();
		const guildId = message.guild?.id || null;

		if (sub === "show") {
			if (!guildId) {
				return respond.reply(message, "Use this in a guild.");
			}
			const target = ctx.getGuildTarget(guildId);
			return respond.reply(
				message,
				[
					`**Config for guild \`${guildId}\`**`,
					`• voiceChannelId: \`${target?.voiceChannelId || "-"}\``,
					`• textChannelId: \`${target?.textChannelId || "-"}\``,
				].join("\n")
			);
		}

		if (sub === "showall") {
			const entries = Object.entries(ctx.getTargets());
			if (!entries.length) {
				return respond.reply(message, "No guild targets configured.");
			}
			return respond.reply(
				message,
				entries
					.map(([id, t]) =>
						[
							`**Guild \`${id}\`**`,
							`• voiceChannelId: \`${t?.voiceChannelId || "-"}\``,
							`• textChannelId: \`${t?.textChannelId || "-"}\``,
						].join("\n")
					)
					.join("\n\n"),
				{ preferReply: false }
			);
		}

		if (sub === "bot") {
			if (!guildId) {
				return respond.reply(message, "Use this in the target guild.");
			}
			const voiceChannelId = ctx.normalizeId(args[0]);
			const textChannelId = args[1]
				? ctx.normalizeId(args[1])
				: message.channel.id;

			if (!voiceChannelId) {
				return respond.reply(
					message,
					`Usage: \`${usedPrefix}${command} bot <voiceChannelId> [textChannelId]\``
				);
			}

			const voiceChannel = await ctx.fetchChannel(voiceChannelId, {
				force: true,
			});
			if (!voiceChannel?.guild?.id) {
				return respond.reply(message, "Invalid voice channel ID.");
			}
			if (voiceChannel.guild.id !== guildId) {
				return respond.reply(
					message,
					"Voice channel must belong to this guild."
				);
			}

			await ctx.settings.update((draft) => {
				draft.targets ||= {};
				draft.targets[guildId] = {
					voiceChannelId,
					textChannelId: textChannelId || null,
				};
			});
			await ctx.sessionManager.updateSessionTarget(guildId, {
				voiceChannelId,
				textChannelId,
			});

			return respond.reply(
				message,
				[
					`**Guild target updated: \`${guildId}\`**`,
					`• voiceChannelId: \`${voiceChannelId}\``,
					`• textChannelId: \`${textChannelId || "-"}\``,
				].join("\n")
			);
		}

		if (sub === "remove") {
			if (!guildId) {
				return respond.reply(message, "Use this in the target guild.");
			}
			await ctx.settings.update((draft) => {
				draft.targets ||= {};
				delete draft.targets[guildId];
			});
			await ctx.sessionManager.removeSession(guildId, { destroy: true });
			return respond.reply(
				message,
				`Removed target for guild \`${guildId}\`.`
			);
		}

		return respond.reply(
			message,
			[
				`\`${usedPrefix}${command} show\``,
				`\`${usedPrefix}${command} showall\``,
				`\`${usedPrefix}${command} bot <voiceChannelId> [textChannelId]\``,
				`\`${usedPrefix}${command} remove\``,
			].join("\n")
		);
	},
});
