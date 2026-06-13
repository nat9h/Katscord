export function toTitleCase(input) {
	return String(input || "")
		.replace(/[-_]/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function truncate(text, maxLength = 60) {
	const value = String(text || "").trim();
	if (!value) {
		return "-";
	}
	if (value.length <= maxLength) {
		return value;
	}
	return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

export function formatDuration(ms) {
	const totalSeconds = Math.ceil(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

export function formatCount(value) {
	const n = Number(value) || 0;
	if (n >= 1_000_000_000) {
		return `${(n / 1_000_000_000).toFixed(1)}B`;
	}
	if (n >= 1_000_000) {
		return `${(n / 1_000_000).toFixed(1)}M`;
	}
	if (n >= 1_000) {
		return `${(n / 1_000).toFixed(1)}K`;
	}
	return String(n);
}

export function safeFilename(value, fallback = "file", maxLength = 60) {
	const clean = String(value || "")
		.trim()
		.replace(/[^\w.-]+/g, "_")
		.replace(/_{2,}/g, "_")
		.replace(/^_+|_+$/g, "")
		.slice(0, Math.max(1, maxLength));
	return clean || fallback;
}
