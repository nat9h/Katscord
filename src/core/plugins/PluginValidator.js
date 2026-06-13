export default class PluginValidator {
	validate(plugin) {
		const errors = [];

		if (!plugin || typeof plugin !== "object") {
			errors.push("Plugin must export an object.");
			return errors;
		}

		if (!plugin.kind || !["command", "event"].includes(plugin.kind)) {
			errors.push("Plugin kind must be 'command' or 'event'.");
		}

		if (!plugin.name || typeof plugin.name !== "string") {
			errors.push("Plugin name must be a non-empty string.");
		}

		if (typeof plugin.execute !== "function") {
			errors.push("Plugin execute must be a function.");
		}

		if (
			plugin.aliases !== undefined &&
			(!Array.isArray(plugin.aliases) ||
				plugin.aliases.some((alias) => typeof alias !== "string"))
		) {
			errors.push("Plugin aliases must be an array of strings.");
		}

		if (
			plugin.kind === "command" &&
			plugin.guildOnly === true &&
			plugin.privateOnly === true
		) {
			errors.push(
				"Command cannot use guildOnly and privateOnly at the same time."
			);
		}

		if (
			plugin.voiceOnly !== undefined &&
			typeof plugin.voiceOnly !== "boolean" &&
			(typeof plugin.voiceOnly !== "object" || plugin.voiceOnly === null)
		) {
			errors.push("voiceOnly must be a boolean or an object.");
		}

		if (
			plugin.requiresSession !== undefined &&
			typeof plugin.requiresSession !== "boolean"
		) {
			errors.push("requiresSession must be a boolean.");
		}

		if (
			plugin.permissions !== undefined &&
			(!Array.isArray(plugin.permissions) ||
				plugin.permissions.some((item) => typeof item !== "string"))
		) {
			errors.push("permissions must be an array of strings.");
		}

		if (
			plugin.clientPermissions !== undefined &&
			(!Array.isArray(plugin.clientPermissions) ||
				plugin.clientPermissions.some(
					(item) => typeof item !== "string"
				))
		) {
			errors.push("clientPermissions must be an array of strings.");
		}

		if (
			plugin.beforeExecute !== null &&
			plugin.beforeExecute !== undefined &&
			typeof plugin.beforeExecute !== "function"
		) {
			errors.push("beforeExecute must be a function or null.");
		}

		if (
			plugin.afterExecute !== null &&
			plugin.afterExecute !== undefined &&
			typeof plugin.afterExecute !== "function"
		) {
			errors.push("afterExecute must be a function or null.");
		}

		if (plugin.cooldown !== undefined) {
			if (
				typeof plugin.cooldown !== "object" ||
				plugin.cooldown === null
			) {
				errors.push("cooldown must be an object.");
			} else {
				const validScopes = ["global", "user", "channel", "guild"];

				if (
					plugin.cooldown.seconds !== undefined &&
					typeof plugin.cooldown.seconds !== "number"
				) {
					errors.push("cooldown.seconds must be a number.");
				}

				if (
					plugin.cooldown.scope !== undefined &&
					!validScopes.includes(plugin.cooldown.scope)
				) {
					errors.push(
						"cooldown.scope must be one of: global, user, channel, guild."
					);
				}
			}
		}

		if (plugin.args !== undefined) {
			if (typeof plugin.args !== "object" || plugin.args === null) {
				errors.push("args must be an object.");
			} else {
				if (
					plugin.args.min !== undefined &&
					!Number.isInteger(plugin.args.min)
				) {
					errors.push("args.min must be an integer.");
				}

				if (
					plugin.args.max !== undefined &&
					plugin.args.max !== null &&
					!Number.isInteger(plugin.args.max)
				) {
					errors.push("args.max must be an integer or null.");
				}

				if (
					plugin.args.validate !== undefined &&
					plugin.args.validate !== null &&
					typeof plugin.args.validate !== "function"
				) {
					errors.push("args.validate must be a function or null.");
				}

				if (
					plugin.args.schema !== undefined &&
					!Array.isArray(plugin.args.schema)
				) {
					errors.push("args.schema must be an array.");
				}
			}
		}

		return errors;
	}
}
