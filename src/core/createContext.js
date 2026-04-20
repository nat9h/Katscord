import path from "node:path";
import SessionManager from "#core/SessionManager";
import SettingsStore from "#core/SettingsStore";
import TTLCache from "#core/TTLCache";
import { MediaProbeService } from "#infra/services/MediaProbeService";
import { SpotifyService } from "#infra/services/SpotifyService";
import { YtdlpService } from "#infra/services/YtdlpService";
import { APIRequest } from "#utils/API/request";
import { createResponder } from "#utils/respond";
import { Client } from "discord.js-selfbot-v13";

const DEFAULT_SETTINGS = {
	prefixes: ["!", "."],
	ownerIds: [],
	targets: {},
	cacheTtlMs: 5 * 60_000,
};

const mediaProbeService = new MediaProbeService();

export function createContext(config) {
	const client = new Client();

	const settings = new SettingsStore(
		config.settingsPath ||
			path.join(process.cwd(), "data", "settings.json"),
		DEFAULT_SETTINGS
	);

	const spotifyService = new SpotifyService(
		config.spotifyClientId,
		config.spotifyClientSecret
	);

	const ytdlpService = new YtdlpService({
		cookiesPath: config.cookiesPath || "./cookies.txt",
	});

	const services = {
		api: APIRequest,
		spotify: spotifyService,
		ytdlp: ytdlpService,
		mediaProbe: mediaProbeService,
	};

	const ctx = {
		...config,
		api: APIRequest,
		client,
		settings,
		respond: createResponder(),
		services,
		mediaProbeService,
		spotifyService,
		ytdlpService,
		userJoinTimes: new Map(),
		runtime: {
			pendingInteraction: null,
			isShuttingDown: false,
			lastCommandChannelId: null,
			lastUsedPrefix: "!",
		},
		pluginManager: null,
		caches: {
			channels: new TTLCache(DEFAULT_SETTINGS.cacheTtlMs),
			guilds: new TTLCache(DEFAULT_SETTINGS.cacheTtlMs),
			users: new TTLCache(DEFAULT_SETTINGS.cacheTtlMs),
			metadata: new TTLCache(10 * 60_000),
		},
		logger: console,
	};

	ctx.sessionManager = new SessionManager(ctx);

	ctx.bootstrap = async () => {
		await ctx.settings.load();

		if (Array.isArray(config.ownerIds) && config.ownerIds.length > 0) {
			await ctx.settings.update((draft) => {
				const merged = new Set([
					...(draft.ownerIds || []),
					...config.ownerIds,
				]);

				draft.ownerIds = [...merged].filter(Boolean);
			});
		}

		ctx.sessionManager.loadFromSettings();
	};

	ctx.normalizeId = (value) => {
		const id = String(value || "").trim();
		return /^\d{16,22}$/.test(id) ? id : null;
	};

	ctx.getCacheTtlMs = () =>
		Number(ctx.settings.get("cacheTtlMs", DEFAULT_SETTINGS.cacheTtlMs)) ||
		DEFAULT_SETTINGS.cacheTtlMs;

	ctx.getPrefixes = () =>
		ctx.settings.get("prefixes", DEFAULT_SETTINGS.prefixes);

	ctx.getOwnerIds = () =>
		ctx.settings.get("ownerIds", DEFAULT_SETTINGS.ownerIds);

	ctx.getTargets = () =>
		ctx.settings.get("targets", DEFAULT_SETTINGS.targets);

	ctx.getGuildTarget = (guildId) => {
		const id = String(guildId || "").trim();
		if (!id) {
			return null;
		}

		return ctx.getTargets()[id] || null;
	};

	ctx.isTrustedAuthor = (userId) => {
		const trusted = new Set(
			[ctx.client.user?.id, ...ctx.getOwnerIds()].filter(Boolean)
		);

		return trusted.has(String(userId));
	};

	ctx.fetchChannel = async (channelId, { force = false, ttlMs } = {}) => {
		const id = ctx.normalizeId(channelId);
		if (!id) {
			return null;
		}

		if (!force) {
			const cached = ctx.caches.channels.get(id);
			if (cached) {
				return cached;
			}
		}

		return ctx.caches.channels.wrap(
			id,
			async () =>
				ctx.client.channels.cache.get(id) ||
				(await ctx.client.channels.fetch(id).catch(() => null)),
			ttlMs || ctx.getCacheTtlMs()
		);
	};

	ctx.fetchGuild = async (guildId, { force = false, ttlMs } = {}) => {
		const id = ctx.normalizeId(guildId);
		if (!id) {
			return null;
		}

		if (!force) {
			const cached = ctx.caches.guilds.get(id);
			if (cached) {
				return cached;
			}
		}

		return ctx.caches.guilds.wrap(
			id,
			async () =>
				ctx.client.guilds.cache.get(id) ||
				(await ctx.client.guilds.fetch(id).catch(() => null)),
			ttlMs || ctx.getCacheTtlMs()
		);
	};

	ctx.resolveCommandInput = (content) => {
		const raw = String(content || "").trim();
		if (!raw) {
			return null;
		}

		const mentionId = ctx.client.user?.id;
		const allPrefixes = [
			...(mentionId ? [`<@${mentionId}>`, `<@!${mentionId}>`] : []),
			...ctx.getPrefixes(),
		]
			.map((x) => String(x || "").trim())
			.filter(Boolean)
			.sort((a, b) => b.length - a.length);

		const usedPrefix = allPrefixes.find(
			(prefix) =>
				raw === prefix ||
				raw.startsWith(`${prefix} `) ||
				raw.startsWith(prefix)
		);

		if (!usedPrefix) {
			return null;
		}

		const body = raw.slice(usedPrefix.length).trim();
		if (!body) {
			return null;
		}

		const parts = body.split(/\s+/).filter(Boolean);
		const commandName = parts.shift()?.toLowerCase() || "";
		if (!commandName) {
			return null;
		}

		return {
			usedPrefix,
			commandName,
			args: parts,
			rawInput: body,
		};
	};

	ctx.setDefaultPresence = () => {
		ctx.client.user?.setPresence({
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

	return ctx;
}
