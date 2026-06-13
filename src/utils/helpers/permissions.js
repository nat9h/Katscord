const PERMISSION_LABELS = {
	ADMINISTRATOR: "Administrator",
	MANAGE_GUILD: "Manage Server",
	MANAGE_CHANNELS: "Manage Channels",
	MANAGE_ROLES: "Manage Roles",
	MANAGE_MESSAGES: "Manage Messages",
	MANAGE_WEBHOOKS: "Manage Webhooks",
	MANAGE_NICKNAMES: "Manage Nicknames",
	MANAGE_THREADS: "Manage Threads",
	MODERATE_MEMBERS: "Timeout Members",
	KICK_MEMBERS: "Kick Members",
	BAN_MEMBERS: "Ban Members",
	VIEW_CHANNEL: "View Channel",
	SEND_MESSAGES: "Send Messages",
	EMBED_LINKS: "Embed Links",
	ATTACH_FILES: "Attach Files",
	READ_MESSAGE_HISTORY: "Read Message History",
	MENTION_EVERYONE: "Mention Everyone",
	ADD_REACTIONS: "Add Reactions",
	USE_EXTERNAL_EMOJIS: "Use External Emojis",
	CONNECT: "Connect",
	SPEAK: "Speak",
	STREAM: "Stream",
	USE_VAD: "Use Voice Activity",
	PRIORITY_SPEAKER: "Priority Speaker",
	DEAFEN_MEMBERS: "Deafen Members",
	MUTE_MEMBERS: "Mute Members",
	MOVE_MEMBERS: "Move Members",
};

export function formatPermission(permission) {
	const key = String(permission || "").trim();
	if (!key) {
		return "";
	}

	if (PERMISSION_LABELS[key]) {
		return PERMISSION_LABELS[key];
	}

	return key
		.toLowerCase()
		.split("_")
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

export function formatPermissions(permissions = []) {
	if (!Array.isArray(permissions) || permissions.length === 0) {
		return "None";
	}

	return permissions.map(formatPermission).filter(Boolean).join(", ");
}
