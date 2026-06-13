/**
 * Tiny shell-like argument parser. Handles quoted strings ("..." / '...')
 * and falls back to whitespace-delimited tokens.
 */

export function consumeLeadingValue(input) {
	const value = String(input || "").trim();
	if (!value) {
		return null;
	}

	const first = value[0];
	if (first === '"' || first === "'") {
		const end = value.indexOf(first, 1);
		if (end === -1) {
			return { value: value.slice(1), rest: "" };
		}
		return {
			value: value.slice(1, end),
			rest: value.slice(end + 1).trim(),
		};
	}

	const match = value.match(/^(\S+)(?:\s+([\s\S]*))?$/);
	if (!match) {
		return null;
	}
	return { value: match[1], rest: (match[2] || "").trim() };
}

export function parseNameAndRest(args) {
	const joined = Array.isArray(args)
		? args.join(" ").trim()
		: String(args || "").trim();
	const first = consumeLeadingValue(joined);
	if (!first) {
		return { name: "", rest: "" };
	}
	return { name: first.value, rest: first.rest };
}

export function parseTwoNames(args) {
	const joined = Array.isArray(args)
		? args.join(" ").trim()
		: String(args || "").trim();
	const first = consumeLeadingValue(joined);
	if (!first) {
		return { firstName: "", secondName: "" };
	}
	const second = consumeLeadingValue(first.rest);
	return {
		firstName: first.value,
		secondName: second?.value || "",
		rest: second?.rest || "",
	};
}
