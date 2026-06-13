/**
 * Wait for the original author to reply with a number (1..max) or 'cancel'
 * in the same channel as the prompt message.
 *
 * Resolves to one of:
 *   { index } — zero-based selection index
 *   { cancelled: true }
 *   { invalid: true } — author replied with a number out of range
 *   { timeout: true }
 */
export async function awaitNumberSelection(
	message,
	max,
	{ timeoutMs = 60_000 } = {}
) {
	const filter = (reply) =>
		reply.author.id === message.author.id &&
		reply.channel.id === message.channel.id &&
		/^(cancel|\d+)$/i.test(reply.content.trim());

	try {
		const collected = await message.channel.awaitMessages({
			filter,
			max: 1,
			time: timeoutMs,
			errors: ["time"],
		});

		const raw = collected.first()?.content.trim() || "";
		if (raw.toLowerCase() === "cancel") {
			return { cancelled: true };
		}

		const num = Number.parseInt(raw, 10);
		if (!Number.isInteger(num) || num < 1 || num > max) {
			return { invalid: true };
		}

		return { index: num - 1 };
	} catch {
		return { timeout: true };
	}
}
