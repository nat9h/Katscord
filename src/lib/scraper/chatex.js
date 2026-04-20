/**
 * Chatex.ai
 * Shoutout to hanntylor (a.k.a. hannuniverse) for creating this wrapper.
 * I only refactored it to ESM and made a few improvements.
 */
import crypto from "node:crypto";
import https from "node:https";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

const CONFIG = {
	host: "chat.chatex.ai",
	origin: "https://chat.chatex.ai",
	model: "openai/gpt-5.4",
	release: "9a4a53f75b15b69a537a88aa2a105e61aeaf6ef1",
	ua: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
	timeout: {
		http: 30000,
		sse: 60000,
	},
};

class CookieJar {
	constructor() {
		this._store = new Map();
	}

	ingest(rawHeaders) {
		for (const raw of Array.isArray(rawHeaders)
			? rawHeaders
			: [rawHeaders]) {
			if (!raw) continue;

			const [nameVal, ...attrs] = raw.split(";").map((s) => s.trim());
			const eqIdx = nameVal.indexOf("=");
			if (eqIdx === -1) continue;

			const meta = {
				value: nameVal.slice(eqIdx + 1).trim(),
				httpOnly: false,
				secure: false,
				sameSite: "lax",
				path: "/",
				domain: CONFIG.host,
				expires: null,
				maxAge: null,
			};

			for (const attr of attrs) {
				const lower = attr.toLowerCase();

				if (lower === "httponly") meta.httpOnly = true;
				else if (lower === "secure") meta.secure = true;
				else if (lower.startsWith("samesite="))
					meta.sameSite = attr.split("=")[1]?.toLowerCase() ?? "lax";
				else if (lower.startsWith("path="))
					meta.path = attr.split("=")[1] ?? "/";
				else if (lower.startsWith("domain="))
					meta.domain = (attr.split("=")[1] ?? CONFIG.host).replace(
						/^\./,
						""
					);
				else if (lower.startsWith("expires=")) {
					const date = new Date(attr.slice(8));
					if (!Number.isNaN(date.getTime())) meta.expires = date;
				} else if (lower.startsWith("max-age=")) {
					const maxAge = Number.parseInt(attr.slice(8), 10);
					if (!Number.isNaN(maxAge)) meta.maxAge = maxAge;
				}
			}

			this._store.set(nameVal.slice(0, eqIdx).trim(), meta);
		}
	}

	serialize() {
		const now = Date.now();
		return [...this._store]
			.filter(
				([, meta]) => !meta.expires || meta.expires.getTime() >= now
			)
			.map(([name, meta]) => `${name}=${meta.value}`)
			.join("; ");
	}

	toObject() {
		return Object.fromEntries(
			[...this._store].map(([name, meta]) => [
				name,
				{
					value: meta.value,
					httpOnly: meta.httpOnly,
					secure: meta.secure,
					sameSite: meta.sameSite,
					path: meta.path,
					domain: meta.domain,
					expires: meta.expires ? meta.expires.toISOString() : null,
					maxAge: meta.maxAge,
				},
			])
		);
	}

	get(name) {
		return this._store.get(name)?.value ?? null;
	}
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function buildSentryHeaders(traceId) {
	return {
		"sentry-trace": `${traceId}-${crypto.randomBytes(8).toString("hex")}-0`,
		baggage: [
			"sentry-environment=production",
			`sentry-release=${CONFIG.release}`,
			"sentry-public_key=880e3505fa2495c8dd95c43f87c2e15c",
			`sentry-trace_id=${traceId}`,
			"sentry-org_id=4507661611630592",
			"sentry-transaction=%2F%3Alocale",
			"sentry-sampled=false",
			"sentry-sample_rand=0.5168182909300654",
			"sentry-sample_rate=0.1",
		].join(","),
	};
}

function buildCommonHeaders(cookieJar, traceId, extra = {}) {
	return {
		"User-Agent": CONFIG.ua,
		Accept: "application/json, text/plain, */*",
		"Accept-Language": "en-US,en;q=0.9",
		"Accept-Encoding": "gzip, deflate, br",
		Referer: `${CONFIG.origin}/en`,
		Origin: CONFIG.origin,
		...(cookieJar.serialize() ? { Cookie: cookieJar.serialize() } : {}),
		...buildSentryHeaders(traceId),
		...extra,
	};
}

function getDecodedStream(res) {
	const encoding = String(
		res.headers["content-encoding"] || ""
	).toLowerCase();
	if (encoding.includes("br")) return res.pipe(createBrotliDecompress());
	if (encoding.includes("gzip")) return res.pipe(createGunzip());
	if (encoding.includes("deflate")) return res.pipe(createInflate());
	return res;
}

async function readResponseText(res) {
	const chunks = [];
	for await (const chunk of getDecodedStream(res)) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return Buffer.concat(chunks).toString("utf8");
}

function httpsRequest(options, body) {
	return new Promise((resolve, reject) => {
		const req = https.request(options, async (res) => {
			try {
				resolve({
					statusCode: res.statusCode ?? 0,
					headers: res.headers,
					raw: await readResponseText(res),
				});
			} catch (error) {
				reject(error);
			}
		});

		req.on("error", reject);
		req.setTimeout(CONFIG.timeout.http, () =>
			req.destroy(new Error("Request timeout"))
		);
		if (body) req.write(body);
		req.end();
	});
}

function parseSSEChunk(buffer, events) {
	const blocks = buffer.split(/\r?\n\r?\n/);
	const remainder = blocks.pop() ?? "";

	for (const block of blocks) {
		const payload = block
			.split(/\r?\n/)
			.filter((line) => line.startsWith("data:"))
			.map((line) => line.slice(5).trimStart())
			.join("\n")
			.trim();

		if (!payload || payload === "[DONE]") continue;

		try {
			events.push(JSON.parse(payload));
		} catch {}
	}

	return remainder;
}

function sseRequest(options, body, onEvent) {
	return new Promise((resolve, reject) => {
		const events = [];

		const req = https.request(options, (res) => {
			const decoded = getDecodedStream(res);
			let buffer = "";

			decoded.on("data", (chunk) => {
				buffer += chunk.toString("utf8");

				const parsed = [];
				buffer = parseSSEChunk(buffer, parsed);

				for (const event of parsed) {
					events.push(event);
					onEvent?.(event);
				}
			});

			decoded.on("end", () => {
				const parsed = [];
				parseSSEChunk(`${buffer}\n\n`, parsed);

				for (const event of parsed) {
					events.push(event);
					onEvent?.(event);
				}

				resolve({
					statusCode: res.statusCode ?? 0,
					headers: res.headers,
					events,
				});
			});

			decoded.on("error", reject);
		});

		req.on("error", reject);
		req.setTimeout(CONFIG.timeout.sse, () =>
			req.destroy(new Error("SSE timeout"))
		);
		if (body) req.write(body);
		req.end();
	});
}

function safeJsonParse(text) {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

async function initSession(cookieJar) {
	const res = await httpsRequest({
		hostname: CONFIG.host,
		path: "/en",
		method: "GET",
		headers: {
			"User-Agent": CONFIG.ua,
			Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
			"Accept-Language": "en-US,en;q=0.9",
			"Accept-Encoding": "gzip, deflate, br",
			"Upgrade-Insecure-Requests": "1",
			"Sec-Fetch-Dest": "document",
			"Sec-Fetch-Mode": "navigate",
			"Sec-Fetch-Site": "none",
		},
	});

	if (res.headers["set-cookie"]) cookieJar.ingest(res.headers["set-cookie"]);

	return {
		endpoint: `${CONFIG.origin}/en`,
		method: "GET",
		statusCode: res.statusCode,
		cookiesReceived: res.headers["set-cookie"] || [],
		contentLength: res.raw.length,
	};
}

async function getAuthSession(cookieJar, traceId) {
	const res = await httpsRequest({
		hostname: CONFIG.host,
		path: "/api/auth/get-session",
		method: "GET",
		headers: buildCommonHeaders(cookieJar, traceId),
	});

	if (res.headers["set-cookie"]) cookieJar.ingest(res.headers["set-cookie"]);

	const parsed = safeJsonParse(res.raw);

	return {
		endpoint: `${CONFIG.origin}/api/auth/get-session`,
		method: "GET",
		statusCode: res.statusCode,
		contentType: res.headers["content-type"] ?? null,
		vercelCache: res.headers["x-vercel-cache"] ?? null,
		session: parsed,
		isAuthenticated:
			parsed !== null &&
			typeof parsed === "object" &&
			Object.hasOwn(parsed, "user"),
	};
}

async function getGeoCurrency(cookieJar, traceId) {
	const res = await httpsRequest({
		hostname: CONFIG.host,
		path: "/api/geo/currency",
		method: "GET",
		headers: buildCommonHeaders(cookieJar, traceId, {
			Accept: "application/json",
		}),
	});

	if (res.headers["set-cookie"]) cookieJar.ingest(res.headers["set-cookie"]);

	return {
		endpoint: `${CONFIG.origin}/api/geo/currency`,
		method: "GET",
		statusCode: res.statusCode,
		contentType: res.headers["content-type"] ?? null,
		geo: safeJsonParse(res.raw),
	};
}

async function registerFingerprint(cookieJar, traceId) {
	const fpid = crypto
		.createHash("md5")
		.update(crypto.randomBytes(32))
		.digest("hex");
	const payload = JSON.stringify({
		fpid,
		confidence: 0.4,
		version: "5.0.1",
	});

	const res = await httpsRequest(
		{
			hostname: CONFIG.host,
			path: "/api/v/fingerprint",
			method: "POST",
			headers: {
				...buildCommonHeaders(cookieJar, traceId),
				"Content-Type": "application/json",
				"Content-Length": Buffer.byteLength(payload),
			},
		},
		payload
	);

	if (res.headers["set-cookie"]) cookieJar.ingest(res.headers["set-cookie"]);

	return {
		endpoint: `${CONFIG.origin}/api/v/fingerprint`,
		method: "POST",
		statusCode: res.statusCode,
		fpid,
		registered: res.statusCode === 204,
	};
}

function parseSSEEvents(events) {
	const result = {
		messageId: null,
		model: null,
		fullText: "",
		textDeltas: [],
		providerMetadata: null,
		usage: null,
		finishReason: null,
		steps: [],
		rawEventCount: events.length,
		eventTypes: {},
	};

	let currentStep = { deltas: [], metadata: null };

	for (const ev of events) {
		result.eventTypes[ev.type] = (result.eventTypes[ev.type] || 0) + 1;

		switch (ev.type) {
			case "start":
				result.messageId = ev.messageId ?? null;
				break;
			case "start-step":
				currentStep = { deltas: [], metadata: null };
				break;
			case "text-start":
				currentStep.metadata = ev.providerMetadata ?? null;
				break;
			case "text-delta":
				if (typeof ev.delta === "string") {
					result.textDeltas.push(ev.delta);
					result.fullText += ev.delta;
					currentStep.deltas.push(ev.delta);
				}
				break;
			case "text-end":
				currentStep.endMetadata = ev.providerMetadata ?? null;
				break;
			case "finish-step":
				result.steps.push({ ...currentStep });
				currentStep = { deltas: [], metadata: null };
				break;
			case "finish":
				result.finishReason = ev.finishReason ?? null;
				break;
			case "data-usage":
				result.usage = ev.data ?? null;
				if (ev.data?.modelId) result.model = ev.data.modelId;
				break;
			default:
				break;
		}
	}

	return result;
}

async function sendChat(
	cookieJar,
	traceId,
	userMessage,
	model,
	chatId,
	messageId
) {
	const payload = JSON.stringify({
		id: chatId,
		message: {
			role: "user",
			parts: [{ type: "text", text: userMessage }],
			id: messageId,
		},
		selectedChatModel: model,
		selectedVisibilityType: "private",
		webSearchEnabled: false,
		imageGenerationEnabled: false,
		isExistingChat: false,
	});

	const rawEvents = [];
	const res = await sseRequest(
		{
			hostname: CONFIG.host,
			path: "/api/chat",
			method: "POST",
			headers: {
				...buildCommonHeaders(cookieJar, traceId),
				"Content-Type": "application/json",
				"Content-Length": Buffer.byteLength(payload),
				Accept: "text/event-stream",
				"Cache-Control": "no-cache",
			},
		},
		payload,
		(ev) => rawEvents.push(ev)
	);

	if (res.headers["set-cookie"]) cookieJar.ingest(res.headers["set-cookie"]);

	return {
		endpoint: `${CONFIG.origin}/api/chat`,
		method: "POST",
		statusCode: res.statusCode,
		contentType: res.headers["content-type"] ?? null,
		vercelAiStream: res.headers["x-vercel-ai-ui-message-stream"] ?? null,
		vercelId: res.headers["x-vercel-id"] ?? null,
		requestPayload: {
			chatId,
			messageId,
			message: userMessage,
			model,
			webSearchEnabled: false,
			imageGenerationEnabled: false,
			isExistingChat: false,
		},
		response: parseSSEEvents(rawEvents),
		rawEventCount: rawEvents.length,
	};
}

async function getVotes(cookieJar, traceId, chatId) {
	const qs = new URLSearchParams({ chatId }).toString();

	const res = await httpsRequest({
		hostname: CONFIG.host,
		path: `/api/vote?${qs}`,
		method: "GET",
		headers: buildCommonHeaders(cookieJar, traceId),
	});

	if (res.headers["set-cookie"]) cookieJar.ingest(res.headers["set-cookie"]);

	const parsed = safeJsonParse(res.raw);

	return {
		endpoint: `${CONFIG.origin}/api/vote?${qs}`,
		method: "GET",
		statusCode: res.statusCode,
		contentType: res.headers["content-type"] ?? null,
		chatId,
		votes: parsed,
		voteCount: Array.isArray(parsed) ? parsed.length : null,
	};
}

export async function chatex(userMessage, model = CONFIG.model) {
	const startedAt = new Date().toISOString();
	const traceId = crypto.randomBytes(16).toString("hex");
	const chatId = crypto.randomUUID();
	const messageId = crypto.randomUUID();
	const cookieJar = new CookieJar();
	const timeline = [];
	const errors = [];

	const record = (step, data) =>
		timeline.push({
			step,
			completedAt: new Date().toISOString(),
			...data,
		});

	let authResult = null;
	let geoResult = null;
	let chatResult = null;

	try {
		record("init_session", await initSession(cookieJar));
	} catch (error) {
		errors.push({ step: "init_session", message: error.message });
	}

	await sleep(200);

	try {
		authResult = await getAuthSession(cookieJar, traceId);
		record("auth_session", authResult);
	} catch (error) {
		errors.push({ step: "auth_session", message: error.message });
	}

	try {
		geoResult = await getGeoCurrency(cookieJar, traceId);
		record("geo_currency", geoResult);
	} catch (error) {
		errors.push({ step: "geo_currency", message: error.message });
	}

	await sleep(300);

	try {
		record("fingerprint", await registerFingerprint(cookieJar, traceId));
	} catch (error) {
		errors.push({ step: "fingerprint", message: error.message });
	}

	await sleep(400);

	try {
		chatResult = await sendChat(
			cookieJar,
			traceId,
			userMessage,
			model,
			chatId,
			messageId
		);
		record("send_chat", chatResult);
	} catch (error) {
		errors.push({ step: "send_chat", message: error.message });
	}

	await sleep(150);

	try {
		record("get_votes", await getVotes(cookieJar, traceId, chatId));
	} catch (error) {
		errors.push({ step: "get_votes", message: error.message });
	}

	const finishedAt = new Date().toISOString();

	return {
		session: {
			traceId,
			chatId,
			messageId,
			model,
			isAnonymous: authResult ? !authResult.isAuthenticated : null,
			cookies: cookieJar.toObject(),
			geo: geoResult?.geo ?? null,
			startedAt,
			finishedAt,
			durationMs:
				new Date(finishedAt).getTime() - new Date(startedAt).getTime(),
		},
		request: { userMessage, model },
		response: chatResult
			? {
					messageId: chatResult.response.messageId,
					model: chatResult.response.model,
					text: chatResult.response.fullText,
					finishReason: chatResult.response.finishReason,
					usage: chatResult.response.usage,
					steps: chatResult.response.steps,
					streaming: {
						rawEventCount: chatResult.rawEventCount,
						eventTypes: chatResult.response.eventTypes,
						textDeltas: chatResult.response.textDeltas,
					},
					http: {
						statusCode: chatResult.statusCode,
						contentType: chatResult.contentType,
						vercelId: chatResult.vercelId,
						vercelAiStream: chatResult.vercelAiStream,
					},
				}
			: null,
		timeline,
		errors,
	};
}
