import { Streamer } from "@dank074/discord-video-stream";
import PlaybackController from "#core/PlaybackController";
import AudioTransport from "#infra/transports/AudioTransport";
import VideoTransport from "#infra/transports/VideoTransport";
import { formatTime } from "#utils/time";

export default class GuildSession {
	constructor({ ctx, guildId, target }) {
		this.ctx = ctx;
		this.guildId = guildId;
		this.target = {
			guildId,
			voiceChannelId: target?.voiceChannelId || null,
			textChannelId: target?.textChannelId || null,
		};

		this.streamer = new Streamer(ctx.client);

		const resolveTarget = () => ({
			guildId: this.guildId,
			voiceChannelId: this.target.voiceChannelId,
			textChannelId: this.target.textChannelId,
		});

		this.videoTransport = new VideoTransport({
			streamer: this.streamer,
			client: ctx.client,
			ytdlpService: ctx.ytdlpService,
			resolveTarget,
		});

		this.audioTransport = new AudioTransport({
			streamer: this.streamer,
			client: ctx.client,
			ytdlpService: ctx.ytdlpService,
			resolveTarget,
		});

		this.playback = new PlaybackController({
			audioTransport: this.audioTransport,
			videoTransport: this.videoTransport,
			onNowPlaying: async (item) => {
				const displayTitle = item.artist
					? `${item.artist} - ${item.title}`
					: item.title;

				ctx.client.user?.setPresence({
					activities: [
						{
							name: displayTitle,
							type:
								item.mode === "video"
									? "WATCHING"
									: "LISTENING",
						},
					],
					status: "dnd",
				});

				await this.announceNowPlaying(item);
			},
			onIdle: () => {
				ctx.setDefaultPresence();
			},
		});
	}

	getTarget() {
		return {
			guildId: this.guildId,
			voiceChannelId: this.target.voiceChannelId,
			textChannelId: this.target.textChannelId,
		};
	}

	setTarget(target = {}) {
		if (target.voiceChannelId !== undefined) {
			this.target.voiceChannelId = target.voiceChannelId || null;
		}

		if (target.textChannelId !== undefined) {
			this.target.textChannelId = target.textChannelId || null;
		}
	}

	async getNowPlayingChannel() {
		const channelId = this.target.textChannelId;
		if (!channelId) {
			return null;
		}

		const channel = await this.ctx.fetchChannel(channelId);
		return channel?.send ? channel : null;
	}

	async announceNowPlaying(item) {
		const channel = await this.getNowPlayingChannel();
		if (!channel) {
			return;
		}

		const title = item.artist
			? `${item.artist} - ${item.title}`
			: item.title;

		const duration = item.duration ? formatTime(item.duration) : "Unknown";
		const mode = (item.mode || "audio").toUpperCase();

		const lines = [
			"▶️ **Now Playing**",
			`**${title}**`,
			`Duration: \`${duration}\` • Mode: \`${mode}\``,
		];

		if (item.thumbnail) {
			lines.push(item.thumbnail);
		}

		try {
			await channel.send(lines.join("\n"));
		} catch (error) {
			console.error("Channel send error:", error);
		}
	}

	async stop() {
		await this.playback.stop();
	}

	async destroy() {
		try {
			await this.playback.stop();
		} catch (error) {
			console.error("Playback stop error:", error);
		}

		try {
			this.streamer.stopStream();
		} catch (error) {
			console.error("Stop stream error:", error);
		}

		try {
			this.streamer.leaveVoice();
		} catch (error) {
			console.error("Leave voice error:", error);
		}
	}
}
