export default {
	kind: "command",
	name: "tiktok",
	aliases: ["tt", "ttdl"],
	help: {
		group: "downloader",
		usage: "tiktok <url>",
		description: "Download TikTok media.",
	},
	failed: "Failed to execute %command: %error",

	async execute({
		message,
		args = [],
		usedPrefix = "!",
		respond,
		command,
		api,
	}) {
		const input = args.join(" ").trim();

		if (!input) {
			return respond.reply(
				message,
				`Usage: \`${usedPrefix + command} <url>\``
			);
		}

		if (!isTiktokUrl(input)) {
			return respond.reply(message, "Please provide a valid TikTok URL.");
		}

		await respond.notice(message, "Fetching TikTok data...");

		const {
			data: { result, status, message: msg },
		} = await api.Gratis.get("/downloader/tiktok", { url: input });

		if (!status) {
			return respond.reply(message, msg);
		}

		const { author, aweme_id, region, desc, duration, download, info } =
			result;

		let caption = [
			"## TikTok Downloader",
			"",
			`> **${author?.nickname || "-"}** (@${author?.unique_id || "-"})`,
			"",
			`**ID:** \`${aweme_id || "-"}\``,
			`**Region:** \`${region || "-"}\``,
			`**Duration:** \`${duration || 0}s\``,
			`**Music:** ${download?.music_info?.title || "-"} — ${download?.music_info?.author || "-"}`,
			`**Stats:** 👁️ ${info?.play_count || 0} • 👍 ${info?.digg_count || 0} • 💬 ${info?.comment_count || 0} • 🔁 ${info?.share_count || 0}`,
			"",
			`**Upload:** ${
				info?.create_time
					? new Date(info.create_time * 1000).toLocaleString("id-ID")
					: "-"
			}`,
			"",
			"**Caption:**",
			`>>> ${desc || "-"}`,
		].join("\n");

		if (download?.images?.length > 0) {
			for (const [i, img] of download.images.entries()) {
				await message.channel
					.send({
						content: i === 0 ? caption : undefined,
						files: [
							{
								attachment: img,
								name: `${author?.nickname || "-"} (@${author?.unique_id || "-"}).jpg`,
							},
						],
					})
					.catch(async () => {
						await message.channel.send({
							content: [
								i === 0 ? caption : null,
								"Failed to upload image directly.",
								img,
							]
								.filter(Boolean)
								.join("\n"),
						});
					});
			}
		} else if (download?.original || download?.watermark) {
			const videoUrl = download.original || download.watermark;

			await message.channel
				.send({
					content: caption,
					files: [
						{
							attachment: videoUrl,
							name: `${download?.music_info?.title || "-"} - ${download?.music_info?.author || "-"}.mp4`,
						},
					],
				})
				.catch(async () => {
					await message.channel.send({
						content: `${caption}\n\nFailed to upload video directly.\n${videoUrl}`,
					});
				});
		}

		if (download?.music) {
			await message.channel
				.send({
					files: [
						{
							attachment: download.music,
							name: `${download?.music_info?.title || "-"} - ${download?.music_info?.author || "-"}.mp3`,
						},
					],
				})
				.catch(async () => {
					await message.channel.send({
						content: `Failed to upload audio directly.\n${download.music}`,
					});
				});
		}
	},
};

function isTiktokUrl(input) {
	try {
		const url = new URL(input);
		return /(^|\.)tiktok\.com$/i.test(url.hostname);
	} catch {
		return false;
	}
}
