const COMMAND_DEFAULTS = {
	kind: "command",
	name: "",
	aliases: [],
	category: null,
	ownerOnly: false,
	guildOnly: false,
	privateOnly: false,
	voiceOnly: false,
	requiresSession: false,
	permissions: [],
	clientPermissions: [],
	failed: "Failed to execute %command: %error",
	beforeExecute: null,
	afterExecute: null,
};

const ARGS_DEFAULTS = {
	min: 0,
	max: null,
	usage: "",
	schema: [],
	validate: null,
};
const COOLDOWN_DEFAULTS = {
	seconds: 0,
	scope: "user",
	message: "Please wait %time before using %command again.",
};
const HELP_DEFAULTS = {
	group: "general",
	hidden: false,
	description: "",
	usage: "",
};

export function defineCommand(definition = {}) {
	return {
		...COMMAND_DEFAULTS,
		...definition,
		args: { ...ARGS_DEFAULTS, ...(definition.args || {}) },
		cooldown: { ...COOLDOWN_DEFAULTS, ...(definition.cooldown || {}) },
		help: { ...HELP_DEFAULTS, ...(definition.help || {}) },
	};
}
