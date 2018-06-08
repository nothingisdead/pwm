import nacl from 'tweetnacl';
import normalizeUrl from 'normalize-url';
import bs58 from 'bs58';

const TEST_STRING     = 'PWM';
const SETTINGS_FILE   = '.pwm.json';
const FILENAME_LENGTH = 16;
const _a              = Symbol('private-async');
const _s              = Symbol('private-sync');

const api      = 'https://api.github.com';
const defaults = {};

export default class PWM {
	constructor(username, password, key) {
		// Store the credentials
		this[_s] = { username, password, key };

		// Initialize gist and settings
		const init = (async () => {
			const settings = Object.assign({}, defaults);
			const data     = [];

			// Get or create the gist
			let gist_id = null;

			for(let { files, id } of (await this.gists)) {
				if(files[SETTINGS_FILE]) {
					// Try to parse the settings file
					const response = await fetch(files[SETTINGS_FILE].raw_url);

					let tmp = null;

					try {
						tmp = await response.json();
					}
					catch(e) {
						continue;
					}

					// Check if this is the gist for the given key
					if(tmp.test && this.decrypt(tmp.test) === TEST_STRING) {
						// Set the gist ID
						gist_id = id;

						// Update the settings
						Object.assign(settings, tmp);

						// Stop checking other gists
						break;
					}
				}
			}

			// If no gist was found
			if(gist_id === null) {
				// Encrypt the test string
				settings.test = this.encrypt(TEST_STRING);

				// Create the settings gist
				const files = {};

				files[SETTINGS_FILE] = {
					content : JSON.stringify(settings, null, "\t"),
				};

				const gist = await this.createGist(files);

				// Set the gist ID
				gist_id = gist.id;
			}

			return { settings, gist_id };
		});

		// Store the settings and gist ID
		this[_a] = init();
	}

	// Returns a Promise that resolves when the instance is ready to use
	get ready() {
		return (async () => {
			await this[_a];
		})();
	}

	static createKey(length) {
		return nacl.randomBytes(length);
	}

	// Encrypt text to [ nonce, encrypted ]
	static encrypt(text, key) {
		const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
		const bytes = Buffer.from(text, 'utf8');
		const box   = nacl.secretbox(bytes, nonce, key);

		return [
			bs58.encode(nonce),
			bs58.encode(box),
		];
	}

	// Decrypt [ nonce, encrypted ] to text
	static decrypt([ nonce_bs58, box_bs58 ], key) {
		const nonce   = bs58.decode(nonce_bs58);
		const box     = bs58.decode(box_bs58);
		const message = nacl.secretbox.open(box, nonce, key);

		if(message === null) {
			return null;
		}

		return Buffer.from(message).toString('utf8');
	}

	// Encrypt using instance key
	encrypt(text) {
		const { key } = this[_s];

		return PWM.encrypt(text, key);
	}

	// Decrypt using instance key
	decrypt([ nonce_bs58, box_bs58 ]) {
		const { key } = this[_s];

		return PWM.decrypt([ nonce_bs58, box_bs58 ], key);
	}

	// Hash some data
	hash(data) {
		const { username, key } = this[_s];

		const message = JSON.stringify([ username, key, data ]);
		const buffer  = Buffer.from(message);

		return bs58.encode(nacl.hash(buffer));
	}

	// Fetch a Github API url
	async fetch(path, options = {}) {
		const { username, password } = this[_s];

		options.headers = Object.assign(options.headers || {}, {
			'authorization' : `Basic ${btoa(`${username}:${password}`)}`
		});

		const response = await fetch(`${api}${path}`, options);

		if(options.method === 'DELETE') {
			return response;
		}
		else {
			return await response.json();
		}
	}

	// Create a gist
	createGist(files) {
		const method = 'POST';

		const request = Object.assign({ files }, {
			description : 'PWM Secret Files',
			public      : 'false',
		});

		const body = JSON.stringify(request);

		return this.fetch('/gists', { body, method });
	}

	// Delete a gist
	deleteGist(gist_id) {
		const method = 'DELETE';

		return this.fetch(`/gists/${gist_id}`, { method });
	}

	// Update a gist
	updateGist(gist_id, files) {
		const method  = 'PATCH';
		const request = { files };
		const body    = JSON.stringify(request);

		return this.fetch(`/gists/${gist_id}`, { body, method });
	}

	// Set a password for a URL + username
	async setPassword(url, username, password) {
		url = normalizeUrl(url);

		const {
			hostname,
			pathname,
			protocol,
			port,
			search,
			href,
		} = new URL(url);

		return this.setSecret(password, [
			// Limit by hostname
			hostname,
			username,
			pathname,
			protocol,
			port,
			search,
			href,
		]);
	}

	// Get a password for a URL + username
	async getPasswords(url, username = '') {
		url = normalizeUrl(url);

		const {
			hostname,
			pathname,
			protocol,
			port,
			search,
			href,
		} = new URL(url);

		return await this.getSecrets([
			// Limit by hostname
			hostname,
			// Username is more important than other tags
			username,
			username,
			username,
			pathname,
			protocol,
			port,
			search,
			href,
		]);
	}

	// Set a secret for a set of tags
	async setSecret(secret = '', tags = [ '_' ]) {
		const { gist_id } = await this[_a];

		// Get the filename and hash
		const part      = this.hash(tags[0]).substr(-FILENAME_LENGTH);
		const hash      = this.hash(tags);
		const file      = `${part}.json`;
		const { files } = await this.fetch(`/gists/${gist_id}`);
		const current   = {};
		const update    = {};

		// Add current secrets for this partition
		if(files[file]) {
			const response = await fetch(files[file].raw_url);
			const secrets  = await response.json();

			Object.assign(current, secrets);
		}

		// Set the secret and tags
		current[hash] = this.encrypt(JSON.stringify([ secret, tags ]));

		update[file] = {
			content : JSON.stringify(current, null, "\t"),
		};

		return await this.updateGist(gist_id, update);
	}

	// Get the secret for a set of tags
	async getSecrets(tags = [ '_' ]) {
		const { gist_id } = await this[_a];

		// Get the filename and hash
		const part      = this.hash(tags[0]).substr(-FILENAME_LENGTH);
		const file      = `${part}.json`;
		const { files } = await this.fetch(`/gists/${gist_id}`);

		if(!(file in files)) {
			return null;
		}

		const response = await fetch(files[file].raw_url);
		const tmp      = await response.json();

		for(let hash in tmp) {
			tmp[hash] = JSON.parse(this.decrypt(tmp[hash]));
		}

		// Sort the secrets by number of tag matches
		const secrets = Object.values(tmp)
			.map(([ secret, tmp_tags ]) => {
				return Object.assign({ secret }, {
					tags    : tmp_tags,
					matches : tags.filter((t) => tmp_tags.includes(t)).length,
				});
			})
			.sort(({ matches : a }, { matches : b }) => b - a);

		return secrets;
	}

	// Get the user's gists
	get gists() {
		return this.fetch(`/gists`);
	}

	// Get the private key for this instance
	get key() {
		const { key } = this[_s];

		return bs58.encode(key);
	}
};
