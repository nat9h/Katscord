import ArgsValidator from "#core/plugins/ArgsValidator";
import CooldownManager from "#core/plugins/CooldownManager";
import { formatDuration } from "#utils/text/format";

export default class PluginExecutor {
	constructor(ctx) {
		this.ctx = ctx;
		this.cooldowns = new CooldownManager();
		this.argsValidator = new ArgsValidator();
	}

	isOwner(userId) {
		const owners = new Set(
			[
				this.ctx.client.user?.id,
				...(this.ctx.getOwnerIds?.() || []),
			].filter(Boolean)
		);
		return owners.has(String(userId));
	}

	async deny(message, text) {
		if (!message) {
			return false;
		}
		await this.ctx.respond.reply(message, text, { preferReply: true });
		return false;
	}

	async runCommand(plugin, payload) {
		const commandPayload = {
			ctx: this.ctx,
			message: payload.message,
			args: payload.parsed?.args || [],
			command: plugin.name,
			commandName: payload.parsed?.commandName || plugin.name,
			usedPrefix: payload.parsed?.usedPrefix || "!",
			rawInput: payload.parsed?.rawInput || "",
			session: payload.session || null,
			pluginManager: payload.pluginManager,
			respond: this.ctx.respond,
			services: this.ctx.services,
			argValues: [],
			namedArgs: {},
		};

		const blocked = await this.runGuards(plugin, commandPayload);
		if (blocked === false) {
			return false;
		}

		const argResult = await this.argsValidator.validate(
			plugin,
			commandPayload
		);
		if (!argResult.ok) {
			return this.deny(commandPayload.message, argResult.message);
		}

		commandPayload.argValues = argResult.values;
		commandPayload.namedArgs = argResult.namedArgs;

		if (typeof plugin.beforeExecute === "function") {
			const proceed = await plugin.beforeExecute(commandPayload);
			if (proceed === false) {
				return false;
			}
		}

		const remainingMs = this.cooldowns.getRemainingMs(
			plugin,
			commandPayload
		);
		if (remainingMs > 0) {
			const text = String(
				plugin?.cooldown?.message ||
					"Please wait %time before using %command again."
			)
				.replace(/%command/g, plugin.name)
				.replace(/%time/g, formatDuration(remainingMs));
			return this.deny(commandPayload.message, text);
		}

		this.cooldowns.consume(plugin, commandPayload);
		const result = await this.execute(plugin, commandPayload);

		if (typeof plugin.afterExecute === "function") {
			await plugin.afterExecute({ ...commandPayload, result });
		}

		return result;
	}

	async runEvent(plugin, payload) {
		const eventPayload = {
			...payload,
			ctx: this.ctx,
			respond: this.ctx.respond,
			services: this.ctx.services,
		};

		if (typeof plugin.beforeExecute === "function") {
			const proceed = await plugin.beforeExecute(eventPayload);
			if (proceed === false) {
				return false;
			}
		}

		const result = await this.execute(plugin, eventPayload, {
			typeLabel: `EVENT:${plugin.name}`,
			replyMessage: null,
		});

		if (typeof plugin.afterExecute === "function") {
			await plugin.afterExecute({ ...eventPayload, result });
		}

		return result;
	}

	async runGuards(plugin, payload) {
		const message = payload.message;

		if (plugin.ownerOnly && !this.isOwner(message?.author?.id)) {
			return this.deny(message, "This command is owner-only.");
		}

		if (plugin.guildOnly && !message?.guild) {
			return this.deny(
				message,
				"This command can only be used in a server."
			);
		}

		if (plugin.privateOnly && message?.guild) {
			return this.deny(
				message,
				"This command can only be used in direct messages."
			);
		}

		if (plugin.requiresSession) {
			if (!message?.guild?.id) {
				return this.deny(
					message,
					"This command can only be used in a server."
				);
			}
			if (!payload.session) {
				const prefix = payload.usedPrefix || "!";
				return this.deny(
					message,
					`No session. Use \`${prefix}config bot <voiceChannelId>\` first.`
				);
			}
		}

		// Voice-only guard
		const voiceRule = this.normalizeVoiceRule(plugin.voiceOnly);
		if (voiceRule) {
			if (!message?.guild) {
				return this.deny(
					message,
					"This command can only be used in a server."
				);
			}

			const authorVoiceChannelId =
				message?.member?.voice?.channelId || null;
			if (!authorVoiceChannelId) {
				return this.deny(
					message,
					"You must join a voice channel first."
				);
			}

			if (voiceRule.sameChannel) {
				const sessionVc =
					payload.session?.target?.voiceChannelId ||
					payload.session?.streamer?.voiceConnection?.joinConfig
						?.channelId ||
					null;

				if (sessionVc && sessionVc !== authorVoiceChannelId) {
					return this.deny(
						message,
						"You must be in the same voice channel as the active session."
					);
				}
			}
		}

		// Permission guards
		if (
			plugin.permissions?.length > 0 ||
			plugin.clientPermissions?.length > 0
		) {
			if (!message?.guild) {
				return this.deny(
					message,
					"This command requires server permissions."
				);
			}

			const target = message.member?.voice?.channel || message.channel;

			if (plugin.permissions?.length > 0) {
				const missing = this.getMissingPerms(
					target,
					message.author.id,
					plugin.permissions
				);
				if (missing.length > 0) {
					return this.deny(
						message,
						`Missing permissions: ${missing.join(", ")}`
					);
				}
			}

			if (plugin.clientPermissions?.length > 0) {
				const missing = this.getMissingPerms(
					target,
					this.ctx.client.user?.id,
					plugin.clientPermissions
				);
				if (missing.length > 0) {
					return this.deny(
						message,
						`Client missing permissions: ${missing.join(", ")}`
					);
				}
			}
		}

		return true;
	}

	normalizeVoiceRule(voiceOnly) {
		if (voiceOnly === true) {
			return { enabled: true, sameChannel: false };
		}
		if (!voiceOnly) {
			return null;
		}
		return { enabled: true, sameChannel: Boolean(voiceOnly.sameChannel) };
	}

	getMissingPerms(target, userId, required = []) {
		if (!required.length || !target?.permissionsFor) {
			return [];
		}
		const perms = target.permissionsFor(userId);
		if (!perms) {
			return [...required];
		}
		return required.filter((p) => !perms.has(p));
	}

	async execute(
		plugin,
		payload,
		{ typeLabel = null, replyMessage = undefined } = {}
	) {
		try {
			return await plugin.execute(payload);
		} catch (error) {
			const label =
				typeLabel ||
				`${String(plugin.kind || "plugin").toUpperCase()}:${plugin.name}`;
			this.ctx.logger?.error?.(`[PLUGIN ${label}]`, error);

			const targetMessage =
				replyMessage === undefined ? payload?.message : replyMessage;
			if (targetMessage) {
				const text = String(
					plugin?.failed || "Failed to execute %command: %error"
				)
					.replace(/%command/g, plugin?.name || "unknown")
					.replace(/%error/g, error?.message || "Unknown error");
				await this.ctx.respond.reply(targetMessage, text, {
					preferReply: true,
				});
			}

			return false;
		}
	}
}
