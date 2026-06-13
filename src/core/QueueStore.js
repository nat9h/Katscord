export default class QueueStore {
	constructor() {
		this.items = [];
	}

	add(item) {
		this.items.push(item);
		return this.size();
	}

	addMany(items = []) {
		if (Array.isArray(items) && items.length > 0) {
			this.items.push(...items);
		}
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
		return this.items.splice(index, 1)[0] || null;
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

	move(from, to) {
		if (!Number.isInteger(from) || !Number.isInteger(to)) {
			return false;
		}
		if (
			from < 0 ||
			to < 0 ||
			from >= this.items.length ||
			to >= this.items.length ||
			from === to
		) {
			return false;
		}
		const [item] = this.items.splice(from, 1);
		this.items.splice(to, 0, item);
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
