import TTLCache from "#core/TTLCache";
import spotifyUrlInfo from "spotify-url-info";

const { getDetails } = spotifyUrlInfo(fetch);

export class SpotifyService {
	constructor(clientId, clientSecret) {
		this.clientId = clientId;
		this.clientSecret = clientSecret;

		this.token = null;
		this.tokenExpiry = 0;

		this.searchCache = new TTLCache(10 * 60_000);
		this.resolveCache = new TTLCache(15 * 60_000);
	}

	async getToken() {
		if (!this.clientId || !this.clientSecret) {
			throw new Error("Spotify credentials are not configured.");
		}

		if (this.token && Date.now() < this.tokenExpiry) {
			return this.token;
		}

		const response = await fetch("https://accounts.spotify.com/api/token", {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Authorization: `Basic ${Buffer.from(
					`${this.clientId}:${this.clientSecret}`
				).toString("base64")}`,
			},
			body: new URLSearchParams({ grant_type: "client_credentials" }),
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(
				`Spotify token request failed: ${response.status} ${text}`
			);
		}

		const data = await response.json();

		if (!data.access_token) {
			throw new Error("Spotify did not return an access token.");
		}

		this.token = data.access_token;
		this.tokenExpiry =
			Date.now() + Math.max(60, data.expires_in - 60) * 1000;

		return this.token;
	}

	async searchTracks(query, limit = 5) {
		const normalizedQuery = String(query || "").trim();
		const safeLimit = Math.max(1, Math.min(50, Number(limit) || 5));

		if (!normalizedQuery) {
			return [];
		}

		const cacheKey = `spotify:search:${normalizedQuery.toLowerCase()}:${safeLimit}`;

		return this.searchCache.wrap(cacheKey, async () => {
			const token = await this.getToken();

			const url = new URL("https://api.spotify.com/v1/search");
			url.searchParams.set("q", normalizedQuery);
			url.searchParams.set("type", "track");
			url.searchParams.set("limit", String(safeLimit));

			const response = await fetch(url.toString(), {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			});

			if (!response.ok) {
				const text = await response.text();
				throw new Error(
					`Spotify search failed: ${response.status} ${text}`
				);
			}

			const data = await response.json();
			return data.tracks?.items || [];
		});
	}

	normalizeSpotifyInput(input) {
		const value = String(input || "").trim();

		if (!value) {
			throw new Error("Spotify input is empty.");
		}

		if (value.startsWith("spotify:")) {
			return value
				.replace("spotify:", "https://open.spotify.com/")
				.replace(/:/g, "/");
		}

		return value;
	}

	mapTrack(trackObj, fallbackPreview, targetUrl) {
		if (!trackObj) {
			return null;
		}

		const artistName = Array.isArray(trackObj.artists)
			? trackObj.artists.map((a) => a.name).join(", ")
			: trackObj.artist || "Unknown Artist";

		const rawDuration =
			trackObj.duration_ms ||
			trackObj.durationMs ||
			trackObj.duration ||
			0;

		return {
			source: "spotify",
			mode: "audio",
			title: trackObj.name || "Unknown Title",
			artist: artistName,
			duration: rawDuration ? Math.floor(rawDuration / 1000) : 0,
			thumbnail:
				trackObj.album?.images?.[0]?.url ||
				fallbackPreview?.image ||
				"",
			youtubeQuery: `${artistName} - ${trackObj.name}`,
			originalInput:
				trackObj.external_urls?.spotify || trackObj.uri || targetUrl,
		};
	}

	async resolveContent(input) {
		const targetUrl = this.normalizeSpotifyInput(input);
		const cacheKey = `spotify:resolve:${targetUrl}`;

		return this.resolveCache.wrap(cacheKey, async () => {
			try {
				const details = await getDetails(targetUrl);
				const preview = details.preview;

				let tracks = details.tracks || [];

				if (!Array.isArray(tracks) && Array.isArray(tracks.items)) {
					tracks = tracks.items.map((t) => t.track || t);
				}

				if (!tracks || tracks.length === 0) {
					throw new Error("No songs found in this URL.");
				}

				return {
					type: preview?.type || "playlist",
					name: preview?.title || "Spotify Content",
					items: tracks
						.map((track) =>
							this.mapTrack(track, preview, targetUrl)
						)
						.filter(Boolean),
				};
			} catch (error) {
				console.error(
					"[SpotifyService] resolveContent error:",
					error?.message || error
				);

				throw new Error(
					"Failed to fetch data from Spotify URL. Make sure the link is valid and public."
				);
			}
		});
	}
}
