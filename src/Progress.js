export default class Progress {
	constructor(el = null) {
		if(el === null) {
			throw new Error("Invalid element");
		}

		this.el    = el;
		this.tasks = [];

		setInterval(() => this.update(), 1000 / 60);
	}

	task(d = 100, n = 1) {
		const task = { d, n };

		this.tasks.push(task);

		return (u = null) => {
			if(u === null || u === d) {
				this.tasks = this.tasks.filter((t) => t !== task);
			}
			else {
				task.n = u;
			}
		};
	}

	get value() {
		const { tasks } = this;

		const n = tasks.map(({ n }) => n).reduce((p, c) => p + c, 0);
		const d = tasks.map(({ d }) => d).reduce((p, c) => p + c, 0);

		return d > 0 ? n / d : 1;
	}

	update() {
		const { value } = this;

		// Set the element width
		this.el.style.width = `${(value * 100).toFixed(2)}%`;

		// Toggle the complete class
		this.el.classList.toggle('complete', value >= 1);
	}
};
