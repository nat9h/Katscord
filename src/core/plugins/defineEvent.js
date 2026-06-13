export function defineEvent(definition = {}) {
	return {
		kind: "event",
		name: "",
		priority: 0,
		once: false,
		failed: "Failed to execute %command: %error",
		beforeExecute: null,
		afterExecute: null,
		...definition,
	};
}
