async function respond(message, content, options = {}) {
	const { preferReply = true } = options;

	if (preferReply) {
		try {
			return await message.reply(content);
		} catch {
			// fallback to channel.send below
		}
	}

	return message.channel.send(content);
}

async function sendNotice(message, content) {
	return message.channel.send(content);
}

export function createResponder() {
	return {
		reply: (message, content, options = {}) =>
			respond(message, content, options),

		notice: (message, content) => sendNotice(message, content),

		async editOrReply(sent, message, content, options = {}) {
			if (typeof sent?.edit === "function") {
				try {
					return await sent.edit(content);
				} catch {
					// fallback to respond below
				}
			}
			return respond(message, content, options);
		},
	};
}
