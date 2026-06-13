import path from "node:path";
import SessionManager from "#core/SessionManager";
import SettingsStore from "#core/SettingsStore";
import TTLCache from "#core/TTLCache";
import { MediaProbeService } from "#infra/services/MediaProbeService";
import { SpotifyService } from "#infra/services/SpotifyService";
import { YtdlpService } from "#infra/services/YtdlpService";
import { createResponder } from "#utils/respond";
import { Client } from "discord.js-selfbot-v13";

const DEFAULTS = {
	prefixes: ["!", "."],
	ownerIds: [],
	targets: {},
	cacheTtlMs: 5 * 60_000,
};

const ID_PATTERN = /^\d{16,22}$/;

export function createContext(config) {
	const client = new Client();

	const settings = new SettingsStore(
		config.settingsPath ||
			path.join(process.cwd(), "data", "settings.json"),
		DEFAULTS
	);

	const spotifyService = new SpotifyService(
		config.spotifyClientId,
		config.spotifyClientSecret
	);

	const ytdlpService = new YtdlpService({
		cookiesPath: config.cookiesPath || "./cookies.txt",
	});

	const mediaProbeService = new MediaProbeService();

	const caches = {
		channels: new TTLCache(DEFAULTS.cacheTtlMs),
		guilds: new TTLCache(DEFAULTS.cacheTtlMs),
	};

	const ctx = {
		...config,
		client,
		settings,
		respond: createResponder(),
		spotifyService,
		ytdlpService,
		mediaProbeService,
		services: {
			spotify: spotifyService,
			ytdlp: ytdlpService,
			mediaProbe: mediaProbeService,
		},
		caches,
		userJoinTimes: new Map(),
		runtime: {
			isShuttingDown: false,
		},
		pluginManager: null,
		sessionManager: null,
		logger: console,
	};

	ctx.sessionManager = new SessionManager(ctx);

	// --- Helpers ---

	ctx.normalizeId = (value) => {
		const id = String(value || "").trim();
		return ID_PATTERN.test(id) ? id : null;
	};

	ctx.getPrefixes = () => ctx.settings.get("prefixes", DEFAULTS.prefixes);
	ctx.getOwnerIds = () => ctx.settings.get("ownerIds", DEFAULTS.ownerIds);
	ctx.getTargets = () => ctx.settings.get("targets", DEFAULTS.targets);
	ctx.getGuildTarget = (guildId) =>
		ctx.getTargets()[String(guildId || "").trim()] || null;

	ctx.isTrustedAuthor = (userId) => {
		const trusted = new Set(
			[ctx.client.user?.id, ...ctx.getOwnerIds()].filter(Boolean)
		);
		return trusted.has(String(userId));
	};

	ctx.fetchChannel = async (channelId, { force = false } = {}) => {
		const id = ctx.normalizeId(channelId);
		if (!id) {
			return null;
		}
		if (!force) {
			const cached = caches.channels.get(id);
			if (cached) {
				return cached;
			}
		}
		return caches.channels.wrap(
			id,
			async () =>
				client.channels.cache.get(id) ||
				(await client.channels.fetch(id).catch(() => null))
		);
	};

	ctx.resolveCommandInput = (content) => {
		const raw = String(content || "").trim();
		if (!raw) {
			return null;
		}

		const mentionId = client.user?.id;
		const allPrefixes = [
			...(mentionId ? [`<@${mentionId}>`, `<@!${mentionId}>`] : []),
			...ctx.getPrefixes(),
		]
			.filter(Boolean)
			.sort((a, b) => b.length - a.length);

		const usedPrefix = allPrefixes.find((p) => raw.startsWith(p));
		if (!usedPrefix) {
			return null;
		}

		const body = raw.slice(usedPrefix.length).trim();
		if (!body) {
			return null;
		}

		const parts = body.split(/\s+/);
		const commandName = parts.shift()?.toLowerCase() || "";
		if (!commandName) {
			return null;
		}

		return { usedPrefix, commandName, args: parts, rawInput: body };
	};

	ctx.setDefaultPresence = () => {
		client.user?.setPresence({
			activities: [{ name: "natsumiworld <3", type: "PLAYING" }],
			status: "online",
		});
	};

	ctx.isAllowedInConfiguredTextChannel = (message) => {
		const guildId = message.guild?.id;
		if (!guildId) {
			return true;
		}
		const target = ctx.getGuildTarget(guildId);
		if (!target?.textChannelId) {
			return true;
		}
		return message.channel.id === target.textChannelId;
	};

	ctx.getSessionForMessage = (message, { create = false } = {}) => {
		const guildId = message.guild?.id;
		if (!guildId) {
			return null;
		}
		if (create) {
			return ctx.sessionManager.ensureSession(
				guildId,
				ctx.getGuildTarget(guildId)
			);
		}
		return ctx.sessionManager.getSession(guildId);
	};

	ctx.bootstrap = async () => {
		await settings.load();

		if (Array.isArray(config.ownerIds) && config.ownerIds.length > 0) {
			await settings.update((draft) => {
				draft.ownerIds = [
					...new Set([...(draft.ownerIds || []), ...config.ownerIds]),
				].filter(Boolean);
			});
		}

		ctx.sessionManager.loadFromSettings();
	};

	return ctx;
}
