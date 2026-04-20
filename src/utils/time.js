export function formatTime(totalSeconds) {
	if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
		return "0:00";
	}

	const seconds = Math.floor(totalSeconds);
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;

	if (h > 0) {
		return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
	}

	return `${m}:${String(s).padStart(2, "0")}`;
}

export function parseTime(input) {
	if (!input) return NaN;

	const value = input.trim();

	if (/^\d+$/.test(value)) {
		return Number(value);
	}

	if (/^\d+:\d+$/.test(value)) {
		const [m, s] = value.split(":").map(Number);
		return m * 60 + s;
	}

	if (/^\d+:\d+:\d+$/.test(value)) {
		const [h, m, s] = value.split(":").map(Number);
		return h * 3600 + m * 60 + s;
	}

	const match = value.match(/^(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?$/i);

	if (match) {
		const h = Number(match[1] || 0);
		const m = Number(match[2] || 0);
		const s = Number(match[3] || 0);

		const total = h * 3600 + m * 60 + s;
		return total > 0 ? total : NaN;
	}

	return NaN;
}
