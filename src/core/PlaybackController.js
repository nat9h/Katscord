export default class PlaybackController {
	constructor({ audioTransport, videoTransport, onNowPlaying, onIdle }) {
		this.audioTransport = audioTransport;
		this.videoTransport = videoTransport;
		this.onNowPlaying = onNowPlaying || (() => {});
		this.onIdle = onIdle || (() => {});

		this.queue = [];
		this.current = null;

		this.running = false;
		this.paused = false;
		this.stopped = false;

		this.loopOne = false;
		this.loopAll = false;

		this.sessionId = 0;
		this.volume = 1.0;
		this.seekSeconds = 0;

		this.queueItemSeq = 0;
		this.lastStartedQueueId = null;
	}

	decorateQueueItem(item) {
		if (!item) {
			return item;
		}
		return {
			...item,
			_queueId: ++this.queueItemSeq,
		};
	}

	enqueue(item) {
		this.queue.push(this.decorateQueueItem(item));
		this.kick();
	}

	enqueueMany(items) {
		this.queue.push(...items.map((item) => this.decorateQueueItem(item)));
		this.kick();
	}

	getQueue() {
		return [...this.queue];
	}

	getCurrent() {
		return this.current;
	}

	getSeekSeconds() {
		return this.seekSeconds;
	}

	getVolume() {
		return this.volume;
	}

	setVolume(percent) {
		const safe = Math.max(0, Math.min(200, percent));
		this.volume = safe / 100;
		return safe;
	}

	toggleLoopOne() {
		this.loopOne = !this.loopOne;
		if (this.loopOne) {
			this.loopAll = false;
		}
		return this.loopOne;
	}

	toggleLoopAll() {
		this.loopAll = !this.loopAll;
		if (this.loopAll) {
			this.loopOne = false;
		}
		return this.loopAll;
	}

	getTransportForItem(item) {
		if (!item) {
			return null;
		}
		return item.mode === "video"
			? this.videoTransport
			: this.audioTransport;
	}

	getInactiveTransportForItem(item) {
		if (!item) {
			return null;
		}
		return item.mode === "video"
			? this.audioTransport
			: this.videoTransport;
	}

	async stop() {
		this.sessionId++;
		this.queue = [];
		this.current = null;
		this.seekSeconds = 0;
		this.paused = false;
		this.stopped = true;
		this.lastStartedQueueId = null;

		await Promise.allSettled([
			this.videoTransport?.stop?.({ keepVoice: true }),
			this.audioTransport?.stop?.({ keepVoice: true }),
		]);
	}

	async skip() {
		if (!this.current) {
			return false;
		}

		this.sessionId++;
		this.seekSeconds = 0;
		this.paused = false;

		await Promise.allSettled([
			this.videoTransport?.stop?.({ keepVoice: true }),
			this.audioTransport?.stop?.({ keepVoice: true }),
		]);

		this.current = null;
		this.kick();
		return true;
	}

	async pause() {
		if (!this.current || this.paused) {
			return false;
		}

		this.paused = true;
		this.sessionId++;

		const activeTransport = this.getTransportForItem(this.current);
		if (!activeTransport?.pause) {
			return false;
		}

		this.seekSeconds = await activeTransport.pause();
		return true;
	}

	async resume() {
		if (!this.current || !this.paused) {
			return false;
		}

		this.paused = false;
		this.stopped = false;
		this.kick();
		return true;
	}

	async seek(seconds) {
		if (!this.current) {
			return false;
		}

		this.seekSeconds = Math.max(0, seconds);
		this.paused = false;
		this.sessionId++;

		await Promise.allSettled([
			this.videoTransport?.stop?.({ keepVoice: true }),
			this.audioTransport?.stop?.({ keepVoice: true }),
		]);

		this.kick();
		return true;
	}

	async kick() {
		if (this.running || this.paused) {
			return;
		}

		this.running = true;
		this.stopped = false;

		try {
			while (!this.paused && !this.stopped) {
				if (!this.current) {
					const next = this.queue.shift();
					if (!next) {
						break;
					}

					this.current = next;
					this.seekSeconds = 0;
				}

				const session = ++this.sessionId;
				await this.playCurrent(session, this.seekSeconds);

				if (session !== this.sessionId) {
					continue;
				}

				const finished = this.current ? { ...this.current } : null;
				this.current = null;
				this.seekSeconds = 0;

				if (finished) {
					if (this.loopOne) {
						this.queue.unshift(this.decorateQueueItem(finished));
					} else if (this.loopAll) {
						this.queue.push(this.decorateQueueItem(finished));
					}
				}
			}
		} finally {
			this.running = false;

			if (!this.current && this.queue.length === 0 && !this.paused) {
				await Promise.allSettled([
					this.videoTransport?.stop?.({ keepVoice: true }),
					this.audioTransport?.stop?.({ keepVoice: true }),
				]);
				this.lastStartedQueueId = null;
				await this.onIdle();
			}
		}
	}

	async playCurrent(sessionId, seekSeconds = 0) {
		const item = this.current;
		if (!item) {
			return;
		}

		if (item._queueId !== this.lastStartedQueueId) {
			this.lastStartedQueueId = item._queueId;
			await this.onNowPlaying(item);
		}

		const activeTransport = this.getTransportForItem(item);
		const inactiveTransport = this.getInactiveTransportForItem(item);

		if (!activeTransport?.play) {
			throw new Error(`No transport available for mode: ${item.mode}`);
		}

		await inactiveTransport?.stop?.({ keepVoice: true });

		if (item.mode === "video") {
			await activeTransport.play(item, {
				sessionId,
				seekSeconds,
				volume: this.volume,
				lowMotion: false,
			});
			return;
		}

		await activeTransport.play(item, {
			sessionId,
			seekSeconds,
			volume: this.volume,
		});
	}
}
