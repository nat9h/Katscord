const ID_PATTERN = /^\d{16,22}$/;

export default class ArgsValidator {
	createFail(message, usage = "") {
		return {
			ok: false,
			message: usage ? `${message}\nUsage: ${usage}` : message,
			values: [],
			namedArgs: {},
		};
	}

	normalizeSchema(schema) {
		return Array.isArray(schema) ? schema : [];
	}

	coerceBoolean(raw) {
		const value = String(raw || "")
			.trim()
			.toLowerCase();

		if (["1", "true", "yes", "y", "on"].includes(value)) {
			return { ok: true, value: true };
		}

		if (["0", "false", "no", "n", "off"].includes(value)) {
			return { ok: true, value: false };
		}

		return {
			ok: false,
			error: `Expected a boolean but got "${raw}".`,
		};
	}

	coerceChoice(field, raw) {
		const choices = Array.isArray(field.choices) ? field.choices : [];
		const input = String(raw || "");
		const match = field.caseInsensitive
			? choices.find(
					(choice) =>
						String(choice).toLowerCase() === input.toLowerCase()
				)
			: choices.find((choice) => String(choice) === input);

		if (match === undefined) {
			return {
				ok: false,
				error: `Argument "${field.name}" must be one of: ${choices.join(", ")}.`,
			};
		}

		return { ok: true, value: match };
	}

	coerceValue(field, raw) {
		const type = String(field.type || "string").toLowerCase();

		switch (type) {
			case "string":
				return { ok: true, value: String(raw) };

			case "number": {
				const value = Number(raw);
				if (!Number.isFinite(value)) {
					return {
						ok: false,
						error: `Argument "${field.name}" must be a number.`,
					};
				}
				return { ok: true, value };
			}

			case "integer": {
				const value = Number(raw);
				if (!Number.isInteger(value)) {
					return {
						ok: false,
						error: `Argument "${field.name}" must be an integer.`,
					};
				}
				return { ok: true, value };
			}

			case "boolean":
				return this.coerceBoolean(raw);

			case "userid":
			case "channelid":
			case "guildid":
				if (!ID_PATTERN.test(String(raw || "").trim())) {
					return {
						ok: false,
						error: `Argument "${field.name}" must be a valid Discord ID.`,
					};
				}
				return { ok: true, value: String(raw).trim() };

			case "url":
				try {
					return { ok: true, value: new URL(String(raw)).toString() };
				} catch {
					return {
						ok: false,
						error: `Argument "${field.name}" must be a valid URL.`,
					};
				}

			case "choice":
				return this.coerceChoice(field, raw);

			default:
				return { ok: true, value: raw };
		}
	}

	async validate(plugin, payload) {
		const config = plugin?.args || {};
		const inputArgs = Array.isArray(payload?.args) ? payload.args : [];
		const usage =
			config.usage ||
			plugin?.help?.usage ||
			`{prefix}${plugin?.name || "command"}`;

		const min = Number.isInteger(config.min) ? config.min : 0;
		const max = Number.isInteger(config.max) ? config.max : null;

		if (inputArgs.length < min) {
			return this.createFail(
				`Not enough arguments for ${plugin.name}.`,
				usage
			);
		}

		if (max !== null && inputArgs.length > max) {
			return this.createFail(
				`Too many arguments for ${plugin.name}.`,
				usage
			);
		}

		const schema = this.normalizeSchema(config.schema);
		const values = [];
		const namedArgs = {};

		if (schema.length > 0) {
			let index = 0;

			for (const field of schema) {
				const isRest = field?.rest === true;
				const required = field?.required !== false;

				let rawValue;

				if (isRest) {
					rawValue = inputArgs.slice(index).join(" ");
					index = inputArgs.length;
				} else {
					rawValue = inputArgs[index];
					index += 1;
				}

				const isMissing =
					rawValue === undefined ||
					rawValue === null ||
					String(rawValue).trim() === "";

				if (isMissing) {
					if (field?.default !== undefined) {
						namedArgs[field.name] = field.default;
						values.push(field.default);
						continue;
					}

					if (required) {
						return this.createFail(
							`Missing required argument: ${field.name}.`,
							usage
						);
					}

					namedArgs[field.name] = undefined;
					values.push(undefined);
					continue;
				}

				const result = this.coerceValue(field, rawValue);
				if (!result.ok) {
					return this.createFail(result.error, usage);
				}

				namedArgs[field.name] = result.value;
				values.push(result.value);
			}
		}

		if (typeof config.validate === "function") {
			const customResult = await config.validate({
				args: inputArgs,
				namedArgs,
				values,
				payload,
				plugin,
			});

			if (customResult === false) {
				return this.createFail(
					`Invalid arguments for ${plugin.name}.`,
					usage
				);
			}

			if (typeof customResult === "string") {
				return this.createFail(customResult, usage);
			}

			if (
				customResult &&
				typeof customResult === "object" &&
				customResult.ok === false
			) {
				return this.createFail(
					customResult.message ||
						`Invalid arguments for ${plugin.name}.`,
					customResult.usage || usage
				);
			}
		}

		return {
			ok: true,
			message: "",
			values,
			namedArgs,
		};
	}
}
