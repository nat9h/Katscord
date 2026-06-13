import { defineCommand } from "#core/plugins/defineCommand";
import tiktok, { isTiktokUrl } from "#lib/scraper/tiktok";
import { awaitNumberSelection } from "#utils/helpers/awaitSelection";
import {
	deliverTikTokPost,
	formatTikTokSearchLine,
} from "#utils/render/tiktok";
import { truncate } from "#utils/text/format";

export default defineCommand({
	name: "tiktok",
	aliases: ["tt", "ttdl"],
	category: "downloader",
	cooldown: { seconds: 5, scope: "user" },
	help: {
		group: "downloader",
		usage: "{prefix}{command} <url|query>",
		description: "Download TikTok video, slideshow, or search by keyword",
		details: [
			"Pass a TikTok URL to download directly",
			"Otherwise, the input is treated as a search query",
			"Reply with a number (1-N) or 'cancel' on the search prompt",
		],
	},
	args: {
		min: 1,
		schema: [{ name: "input", type: "string", required: true, rest: true }],
	},

	async execute({ message, namedArgs, respond }) {
		const input = String(namedArgs.input || "").trim();

		if (isTiktokUrl(input)) {
			await respond.notice(message, "Fetching TikTok data...");
			const data = await tiktok.download(input);
			await deliverTikTokPost(message.channel, data);
			return;
		}

		await respond.notice(
			message,
			`Searching TikTok for: **${truncate(input, 80)}**...`
		);

		const results = await tiktok.search(input, { count: 8 });
		const lines = results.map(formatTikTokSearchLine);

		await respond.notice(
			message,
			`TikTok Search Results:\n\n${lines.join("\n")}\n\nReply with a number (1-${results.length}) or 'cancel'`
		);

		const selection = await awaitNumberSelection(message, results.length);

		if (selection.cancelled) {
			return respond.reply(message, "Search cancelled.");
		}
		if (selection.timeout) {
			return respond.reply(message, "Search selection timed out.");
		}
		if (selection.invalid) {
			return respond.reply(message, "Invalid selection.");
		}

		await respond.notice(message, "Fetching selected post...");
		await deliverTikTokPost(message.channel, results[selection.index]);
	},
});
