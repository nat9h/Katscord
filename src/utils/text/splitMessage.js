export function splitMessage(text, maxLength = 1900) {
	const value = String(text || "");
	if (value.length <= maxLength) {
		return [value];
	}

	const chunks = [];
	let current = "";

	for (const section of value.split("\n\n")) {
		const candidate = current ? `${current}\n\n${section}` : section;

		if (candidate.length <= maxLength) {
			current = candidate;
			continue;
		}

		if (current) {
			chunks.push(current);
			current = "";
		}

		if (section.length <= maxLength) {
			current = section;
			continue;
		}

		for (const line of section.split("\n")) {
			const lineCandidate = current ? `${current}\n${line}` : line;

			if (lineCandidate.length <= maxLength) {
				current = lineCandidate;
				continue;
			}

			if (current) {
				chunks.push(current);
			}

			if (line.length <= maxLength) {
				current = line;
				continue;
			}

			let remaining = line;
			while (remaining.length > maxLength) {
				chunks.push(remaining.slice(0, maxLength));
				remaining = remaining.slice(maxLength);
			}
			current = remaining;
		}
	}

	if (current) {
		chunks.push(current);
	}
	return chunks;
}
