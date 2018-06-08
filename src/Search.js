const SECURE_NOTE_PREFIX = '__';

export default class Search {
	constructor(form, results, pwm) {
		const add = form.querySelector('.add-button');

		// Handle updating the search results
		form.addEventListener('input', () => this.update());

		// Handle adding a secret
		form.addEventListener('submit', (e) => {
			e.preventDefault();
			this.set();
		});

		// Handle switching to site mode
		form
			.querySelector('.site-mode-button')
			.addEventListener('click', () => this.siteMode());

		// Handle switching to secure note mode
		form
			.querySelector('.note-mode-button')
			.addEventListener('click', () => this.noteMode());

		// Store local properties
		Object.assign(this, { form, results, pwm });

		// Show the search form
		form.classList.remove('hidden');
	}

	get tags() {
		const { form } = this;

		const site_mode = form.classList.contains('site-mode');
		const data      = new FormData(form);

		return data
			.get(site_mode ? 'site' : 'tags')
			.split(/\s+/)
			.filter((v) => !!v.length);
	}

	// Switch to site mode
	siteMode() {
		const { form } = this;

		form.classList.remove('note-mode');
		form.classList.add('site-mode');

		form.reset();
	}

	// Switch to note mode
	noteMode() {
		const { form } = this;

		form.classList.remove('site-mode');
		form.classList.add('note-mode');

		form.reset();
	}

	// Update the search results
	async update() {
		const { form, results, pwm } = this;

		const tags      = this.tags;
		const site_mode = form.classList.contains('site-mode');

		let items = [];

		if(tags.length) {
			if(site_mode) {
				const url      = tags[0];
				const username = tags[1];

				items = await pwm.getPasswords(url, username) || [];
			}
			else {
				// All secure notes are prefixed with the same tag
				tags.unshift(SECURE_NOTE_PREFIX);

				items = await pwm.getSecrets(tags) || [];
			}
		}

		if(items.length) {
			results.innerHTML = items.map(({ secret, tags }, i) => `
				<li class="search-result" data-result="${i}">
					<span class="result-tags" title="Click to copy ${site_mode ? 'password' : 'secure note'}">
						${site_mode ? `
							${tags[1]}@${tags[0]}
						` : `
							${tags.join(' ')}
						`}
					</span>
					<button class="icon-eye view-button" title="Click to view ${site_mode ? 'password' : 'secure note'}"></button>
					<input type="text" class="result-secret invisible">
				</li>
			`).join('');

			items.forEach(({ secret }, i) => {
				const item  = results.querySelector(`[data-result="${i}"]`);
				const input = item.querySelector('.result-secret');
				const view  = item.querySelector('.view-button');
				const tags  = item.querySelector('.result-tags');

				tags.addEventListener('click', () => {
					input.select();
					document.execCommand('copy');
				});

				view.addEventListener('click', () => alert(`${site_mode ? 'Password:' : 'Secure Note:'}\n\n${input.value}`));

				input.value = secret;
			});

			results.classList.remove('hidden');
		}
		else {
			results.classList.add('hidden');
		}
	}

	// Disable inputs
	disable() {
		const { form } = this;
		const inputs   = Array.from(form.querySelectorAll('input, button'));

		for(let input of inputs) {
			input.setAttribute('disabled', true);
		}
	}

	// Enable inputs
	enable() {
		const { form } = this;
		const inputs   = Array.from(form.querySelectorAll('input, button'));

		for(let input of inputs) {
			input.removeAttribute('disabled');
		}
	}

	// Set a secret
	// TODO: pretty modal for input
	async set() {
		const { form, tags, pwm } = this;

		const site_mode = form.classList.contains('site-mode');
		const min_tags  = site_mode ? 2 : 1;

		if(tags.length < min_tags) {
			if(site_mode) {
				alert("Please enter the URL, followed by your username.");
			}
			else {
				alert("Please enter at least one tag.");
			}

			return null;
		}

		let result   = null;
		let site     = null;
		let username = null;
		let secret   = null;

		if(site_mode) {
			site     = tags[0];
			username = tags[1];
			secret   = prompt(`Enter password for user ${username} at ${site}`);
		}
		else {
			secret = prompt(`Enter secure note for [${tags.join(' ')}]`);

			// Prefix all secure notes with the same tag
			tags.unshift(SECURE_NOTE_PREFIX);
		}

		if(!secret.length) {
			alert(`No ${site_mode ? 'password' : 'note'} entered`);

			return null;
		}

		// Disable inputs
		this.disable();

		// Save the secret
		if(site_mode) {
			result = await pwm.setPassword(site, username, secret);
		}
		else {
			result = await pwm.setSecret(secret, tags);
		}

		// Enable inputs
		this.enable();

		return result;
	}
}
