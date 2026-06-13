/**
 * TikTok scraper using TikTok internal API as primary (xct007 method),
 * with tikwm as fallback. Supports videos, slideshows, and search.
 *
 * Native `fetch` only — no external HTTP deps.
 */
import TTLCache from "#core/TTLCache";

const UA =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const TIKWM_API = "https://www.tikwm.com/api/";

const INTERNAL_ENDPOINTS = [
	"https://api22-normal-c-alisg.tiktokv.com",
	"https://api16-normal-useast5.us.tiktokv.com",
	"https://api19-normal-c-useast1a.tiktokv.com",
	"https://api16-normal-c-useast1a.tiktokv.com",
];

const ID_REGEX = /(?:video|photo)\/(\d+)/;
const SHORT_LINK_REGEX = /(?:vm|vt)\.tiktok\.com/i;
const TIKTOK_HOST_REGEX = /(^|\.)tiktok\.com$/i;

export function isTiktokUrl(input) {
	try {
		return TIKTOK_HOST_REGEX.test(new URL(String(input || "")).hostname);
	} catch {
		return false;
	}
}

function abortAfter(ms) {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), ms);
	return { signal: ctrl.signal, cancel: () => clearTimeout(timer) };
}

function deviceId() {
	let id = "";
	for (let i = 0; i < 19; i++) {
		id += Math.floor(Math.random() * 10);
	}
	return id;
}

function pickFirst(list) {
	if (!Array.isArray(list)) {
		return "";
	}
	return list.find((value) => typeof value === "string" && value) || "";
}

function stripTrackingParams(url) {
	try {
		const parsed = new URL(url);
		// keep only minimal querystring, drop noisy tracking params
		const allowed = new Set(["lang"]);
		const params = [...parsed.searchParams.keys()];
		for (const key of params) {
			if (!allowed.has(key.toLowerCase())) {
				parsed.searchParams.delete(key);
			}
		}
		return parsed.toString();
	} catch {
		return url;
	}
}

async function extractId(url) {
	const direct = url.match(ID_REGEX);
	if (direct) {
		return direct[1];
	}

	if (SHORT_LINK_REGEX.test(url)) {
		const { signal, cancel } = abortAfter(10_000);
		try {
			const res = await fetch(url, {
				redirect: "follow",
				headers: { "User-Agent": UA },
				signal,
			});
			const m = res.url.match(ID_REGEX);
			if (m) {
				return m[1];
			}
		} catch {
			// swallow, fall through to numeric guess
		} finally {
			cancel();
		}
	}

	const numeric = url.match(/(\d{15,})/);
	if (numeric) {
		return numeric[1];
	}

	throw new Error("Could not extract TikTok video ID from URL.");
}

function parseInternal(aweme) {
	const video = aweme.video || {};
	const author = aweme.author || {};
	const music = aweme.music || {};
	const stats = aweme.statistics || {};
	const imagePost = aweme.image_post_info || null;

	const videoNoWm =
		pickFirst(video.download_addr?.url_list) ||
		pickFirst(video.play_addr?.url_list);
	const videoSd = pickFirst(video.play_addr?.url_list);

	let images = null;
	if (Array.isArray(imagePost?.images) && imagePost.images.length > 0) {
		images = imagePost.images
			.map(
				(img) =>
					pickFirst(img.display_image?.url_list) ||
					pickFirst(img.owner_watermark_image?.url_list)
			)
			.filter(Boolean);
		if (!images.length) {
			images = null;
		}
	}

	return {
		id: aweme.aweme_id,
		title: aweme.desc || "",
		cover:
			pickFirst(video.origin_cover?.url_list) ||
			pickFirst(video.cover?.url_list),
		duration: video.duration ? Math.round(video.duration / 1000) : 0,
		video: videoNoWm,
		videoHd: videoNoWm,
		videoSd,
		music: pickFirst(music.play_url?.url_list),
		musicInfo: {
			title: music.title || "",
			author: music.author || "",
			album: music.album || "",
			url: pickFirst(music.play_url?.url_list),
			cover: pickFirst(music.cover_large?.url_list),
			duration: music.duration || 0,
		},
		author: {
			id: author.uid || "",
			name: author.unique_id || "",
			nickname: author.nickname || "",
			avatar: pickFirst(author.avatar_thumb?.url_list),
		},
		stats: {
			likes: stats.digg_count || 0,
			comments: stats.comment_count || 0,
			shares: stats.share_count || 0,
			views: stats.play_count || 0,
			saves: stats.collect_count || 0,
		},
		images,
		createdAt: aweme.create_time || 0,
	};
}

function parseTikwm(d) {
	return {
		id: d.id,
		title: d.title || "",
		cover: d.origin_cover || d.cover || "",
		duration: d.duration || 0,
		video: d.hdplay || d.play || "",
		videoHd: d.hdplay || "",
		videoSd: d.play || "",
		music: d.music || "",
		musicInfo: {
			title: d.music_info?.title || "",
			author: d.music_info?.author || "",
			album: d.music_info?.album || "",
			url: d.music_info?.play || "",
			cover: d.music_info?.cover || "",
			duration: d.music_info?.duration || 0,
		},
		author: {
			id: d.author?.id || "",
			name: d.author?.unique_id || "",
			nickname: d.author?.nickname || "",
			avatar: d.author?.avatar || "",
		},
		stats: {
			likes: d.digg_count || 0,
			comments: d.comment_count || 0,
			shares: d.share_count || 0,
			views: d.play_count || 0,
			saves: d.collect_count || 0,
		},
		images: Array.isArray(d.images) && d.images.length ? d.images : null,
		createdAt: d.create_time || 0,
	};
}

async function fetchInternal(awemeId) {
	let lastError = null;

	for (const baseURL of INTERNAL_ENDPOINTS) {
		const url = new URL("/aweme/v1/feed/", baseURL);
		url.searchParams.set("iid", deviceId());
		url.searchParams.set("device_id", deviceId());
		url.searchParams.set("version_code", "300904");
		url.searchParams.set("aweme_id", awemeId);

		const { signal, cancel } = abortAfter(15_000);

		try {
			const res = await fetch(url, {
				method: "OPTIONS",
				headers: {
					"User-Agent": "okhttp/3.14.9",
					Accept: "application/json",
				},
				signal,
			});

			if (!res.ok) {
				lastError = new Error(`HTTP ${res.status}`);
				continue;
			}

			const data = await res.json();
			const list = Array.isArray(data?.aweme_list) ? data.aweme_list : [];
			const aweme = list.find((item) => item.aweme_id === awemeId);
			if (aweme) {
				return aweme;
			}
		} catch (error) {
			lastError = error;
		} finally {
			cancel();
		}
	}

	throw lastError || new Error("All internal API endpoints failed.");
}

async function fetchTikwm(url, hd = "1") {
	const { signal, cancel } = abortAfter(15_000);

	try {
		const res = await fetch(TIKWM_API, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				"User-Agent": UA,
			},
			body: new URLSearchParams({ url, hd }),
			signal,
		});

		const data = await res.json();
		if (data.code !== 0 || !data.data) {
			throw new Error(data.msg || "tikwm returned no data.");
		}
		return parseTikwm(data.data);
	} finally {
		cancel();
	}
}

async function isReachable(url) {
	if (!url) {
		return false;
	}
	const { signal, cancel } = abortAfter(8_000);

	try {
		const res = await fetch(url, {
			method: "HEAD",
			headers: {
				"User-Agent": UA,
				Referer: "https://www.tiktok.com/",
			},
			signal,
		});
		if (!res.ok) {
			return false;
		}
		const len = Number(res.headers.get("content-length") || 0);
		return len > 1000;
	} catch {
		return false;
	} finally {
		cancel();
	}
}

class TikTokScraper {
	constructor() {
		this.downloadCache = new TTLCache(5 * 60_000);
		this.searchCache = new TTLCache(5 * 60_000);
	}

	async download(input) {
		const url = String(input || "").trim();
		if (!url) {
			throw new Error("TikTok URL is required.");
		}

		const cacheKey = `tt:dl:${url}`;
		return this.downloadCache.wrap(cacheKey, async () => {
			let internalError = null;

			try {
				const awemeId = await extractId(url);
				const aweme = await fetchInternal(awemeId);
				const parsed = parseInternal(aweme);

				if (parsed.images?.length) {
					return parsed;
				}

				if (parsed.video) {
					if (await isReachable(parsed.video)) {
						return parsed;
					}
					if (
						parsed.videoSd &&
						parsed.videoSd !== parsed.video &&
						(await isReachable(parsed.videoSd))
					) {
						parsed.video = parsed.videoSd;
						return parsed;
					}
					return parsed;
				}
			} catch (error) {
				internalError = error;
			}

			try {
				const cleanUrl = stripTrackingParams(url);
				let result = await fetchTikwm(cleanUrl, "1");

				if (result.images?.length) {
					return result;
				}

				if (result.video) {
					if (await isReachable(result.video)) {
						return result;
					}
					if (
						result.videoSd &&
						result.videoSd !== result.video &&
						(await isReachable(result.videoSd))
					) {
						result.video = result.videoSd;
						return result;
					}

					result = await fetchTikwm(cleanUrl, "0");
					if (result.video && (await isReachable(result.video))) {
						return result;
					}
				}

				if (result.images?.length || result.video) {
					return result;
				}

				throw new Error("tikwm returned no playable data.");
			} catch (error) {
				const internalMsg = internalError?.message || "unknown";
				throw new Error(
					`All sources failed (internal: ${internalMsg} | tikwm: ${error.message})`
				);
			}
		});
	}

	async search(query, { count = 8, cursor = 0 } = {}) {
		const normalized = String(query || "").trim();
		if (!normalized) {
			throw new Error("Search query is required.");
		}

		const safeCount = Math.max(1, Math.min(20, Number(count) || 8));
		const cacheKey = `tt:search:${normalized.toLowerCase()}:${safeCount}:${cursor}`;

		return this.searchCache.wrap(cacheKey, async () => {
			const { signal, cancel } = abortAfter(15_000);

			try {
				const res = await fetch(`${TIKWM_API}feed/search`, {
					method: "POST",
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
						"User-Agent": UA,
					},
					body: new URLSearchParams({
						keywords: normalized,
						count: String(safeCount),
						cursor: String(cursor),
						hd: "1",
					}),
					signal,
				});

				const data = await res.json();
				const items = data?.data?.videos;

				if (data.code !== 0 || !Array.isArray(items) || !items.length) {
					throw new Error(data.msg || "No results found.");
				}

				return items.map(parseTikwm);
			} finally {
				cancel();
			}
		});
	}
}

export default new TikTokScraper();
