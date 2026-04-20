// TODO: using queuestore to handling request per-user.
export default class QueueStore {
	constructor() {
		this.items = [];
	}

	add(item) {
		this.items.push(item);
		return this.size();
	}

	addMany(items = []) {
		if (!Array.isArray(items) || items.length === 0) {
			return this.size();
		}

		this.items.push(...items);
		return this.size();
	}

	next() {
		return this.items.shift() || null;
	}

	peek() {
		return this.items[0] || null;
	}

	getAll() {
		return [...this.items];
	}

	get(index) {
		if (!Number.isInteger(index) || index < 0) {
			return null;
		}

		return this.items[index] || null;
	}

	remove(index) {
		if (
			!Number.isInteger(index) ||
			index < 0 ||
			index >= this.items.length
		) {
			return null;
		}

		const [removed] = this.items.splice(index, 1);
		return removed || null;
	}

	clear() {
		const count = this.items.length;
		this.items = [];
		return count;
	}

	size() {
		return this.items.length;
	}

	isEmpty() {
		return this.items.length === 0;
	}

	move(fromIndex, toIndex) {
		if (
			!Number.isInteger(fromIndex) ||
			!Number.isInteger(toIndex) ||
			fromIndex < 0 ||
			toIndex < 0 ||
			fromIndex >= this.items.length ||
			toIndex >= this.items.length ||
			fromIndex === toIndex
		) {
			return false;
		}

		const [item] = this.items.splice(fromIndex, 1);
		this.items.splice(toIndex, 0, item);
		return true;
	}

	shuffle() {
		for (let i = this.items.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[this.items[i], this.items[j]] = [this.items[j], this.items[i]];
		}

		return this.getAll();
	}

	insertNext(item) {
		this.items.unshift(item);
		return this.size();
	}
}
