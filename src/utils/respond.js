export async function respond(message, content, options = {}) {
	const { preferReply = true } = options;

	if (preferReply) {
		try {
			return await message.reply(content);
		} catch {}
	}

	return message.channel.send(content);
}

export async function sendNotice(message, content) {
	return message.channel.send(content);
}

export function createResponder() {
	return {
		reply(message, content, options = {}) {
			return respond(message, content, options);
		},

		notice(message, content) {
			return sendNotice(message, content);
		},

		async editOrReply(sent, message, content, options = {}) {
			if (typeof sent?.edit === "function") {
				try {
					return await sent.edit(content);
				} catch {}
			}

			return respond(message, content, options);
		},
	};
}
