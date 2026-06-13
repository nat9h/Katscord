/**
 * Discord delivery layer for TikTok scraper output.
 * Keeps the plugin command thin: it just resolves data and calls deliverTikTokPost.
 */
import { formatCount, safeFilename, truncate } from "#utils/text/format";
import { formatTime } from "#utils/time";

const SLIDESHOW_BATCH_SIZE = 10;

export function buildTikTokCaption(data) {
	const stats = [
		`👁️ ${formatCount(data.stats?.views)}`,
		`👍 ${formatCount(data.stats?.likes)}`,
		`💬 ${formatCount(data.stats?.comments)}`,
		`🔁 ${formatCount(data.stats?.shares)}`,
	].join(" • ");

	const nickname = data.author?.nickname || "-";
	const handle = data.author?.name || "-";
	const music = data.musicInfo || {};

	const lines = [
		"## TikTok Downloader",
		"",
		`> **${nickname}** (@${handle})`,
		"",
		`**Duration:** \`${formatTime(data.duration || 0)}\``,
		`**Music:** ${truncate(music.title || "-", 60)} — ${truncate(music.author || "-", 40)}`,
		`**Stats:** ${stats}`,
	];

	if (data.title) {
		lines.push("", "**Caption:**", `>>> ${truncate(data.title, 1500)}`);
	}

	return lines.join("\n");
}

async function sendVideo(channel, data, caption) {
	const videoUrl = data.video || data.videoSd;
	if (!videoUrl) {
		await channel.send(`${caption}\n\n_No video available._`);
		return;
	}

	const filename = `${safeFilename(data.author?.name, "tiktok")}_${data.id || "video"}.mp4`;

	try {
		await channel.send({
			content: caption,
			files: [{ attachment: videoUrl, name: filename }],
		});
	} catch {
		await channel.send(`${caption}\n\n**Download:** ${videoUrl}`);
	}
}

async function sendSlideshow(channel, data, caption) {
	const images = Array.isArray(data.images) ? data.images : [];
	const safeNick = safeFilename(
		data.author?.name || data.author?.nickname,
		"tiktok"
	);

	for (
		let offset = 0;
		offset < images.length;
		offset += SLIDESHOW_BATCH_SIZE
	) {
		const batch = images.slice(offset, offset + SLIDESHOW_BATCH_SIZE);
		const files = batch.map((url, idx) => ({
			attachment: url,
			name: `${safeNick}_${offset + idx + 1}.jpg`,
		}));

		try {
			await channel.send({
				content: offset === 0 ? caption : undefined,
				files,
			});
		} catch {
			const content = [offset === 0 ? caption : null, ...batch]
				.filter(Boolean)
				.join("\n");
			await channel.send(content);
		}
	}
}

async function sendMusic(channel, data) {
	const musicUrl = data.musicInfo?.url || data.music;
	if (!musicUrl || typeof musicUrl !== "string") {
		return;
	}

	const name = safeFilename(data.musicInfo?.title || "audio", "audio");

	try {
		await channel.send({
			files: [{ attachment: musicUrl, name: `${name}.mp3` }],
		});
	} catch {
		await channel.send(`**Music:** ${musicUrl}`);
	}
}

export async function deliverTikTokPost(channel, data) {
	const caption = buildTikTokCaption(data);

	if (Array.isArray(data.images) && data.images.length > 0) {
		await sendSlideshow(channel, data, caption);
		return;
	}

	await sendVideo(channel, data, caption);
	await sendMusic(channel, data);
}

export function formatTikTokSearchLine(item, index) {
	const author = item.author?.nickname || item.author?.name || "-";
	const dur = item.duration ? formatTime(item.duration) : "-";
	const views = formatCount(item.stats?.views);
	return `**${index + 1}.** ${truncate(item.title || "(no caption)", 60)} — ${author} \`[${dur} | 👁️ ${views}]\``;
}
