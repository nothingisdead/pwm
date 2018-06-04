import PWM from './PWM';
import bs58 from 'bs58';

const KEY_LENGTH = 32;

let key = document.location.hash.substring(1);

if(key && key.length) {
	key = bs58.decode(key);
}

if(!key || key.length !== KEY_LENGTH) {
	key = PWM.createKey(KEY_LENGTH);
}

// If a new key was generated, set the location hash
document.location.hash = bs58.encode(key);

const login = async () => {
	let un     = null;
	let pw     = null;
	let stored = true;

	try {
		const un_tmp = JSON.parse(sessionStorage.getItem('pwm-un'));
		const pw_tmp = JSON.parse(sessionStorage.getItem('pwm-pw'));

		un = PWM.decrypt(un_tmp, key);
		pw = PWM.decrypt(pw_tmp, key);
	}
	catch(e) {}

	if(un === null || pw === null) {
		stored = false;

		const tmp = await new Promise((resolve, reject) => {
			const container = document.querySelector('.login');
			const form      = container.querySelector('.login-form');
			const username  = form.querySelector('[name="username"]');
			const github    = document.location.hostname.match(/^(.+)\.github\.io$/);

			// Auto-fill Github username when loading from *.github.io
			if(github) {
				username.value = github[1];
			}

			// Show the login screen
			container.classList.remove('hidden');

			const handleLogin = (e) => {
				e.preventDefault();
				form.removeEventListener('submit', handleLogin);

				// Get the username and password
				const data = new FormData(form);
				const un   = data.get('username');
				const pw   = data.get('password');

				// Hide the login form
				container.classList.add('hidden');

				resolve({ un, pw });
			};

			form.addEventListener('submit', handleLogin);
		});

		un = tmp.un;
		pw = tmp.pw;

		// Store the username/password in session storage
		const tmp_un = PWM.encrypt(un, key);
		const tmp_pw = PWM.encrypt(pw, key);

		sessionStorage.setItem('pwm-un', JSON.stringify(tmp_un));
		sessionStorage.setItem('pwm-pw', JSON.stringify(tmp_pw));
	}

	// Instantiate the password manager
	let instance = null;

	try {
		// Create a new instance
		instance = new PWM(un, pw, key);

		// Wait for the instance to be ready
		await instance.ready;
	}
	catch(e) {
		// If using stored credentials, clear them and try again
		if(stored) {
			sessionStorage.removeItem('pwm-un');
			sessionStorage.removeItem('pwm-pw');

			return await login();
		}

		// Otherwise throw the error
		throw e;
	}

	return instance;
};

(async () => {
	const pwm    = await login();
	const search = document.querySelector('.search');
	const input  = search.querySelector('[name="tags"]');

	search.classList.remove('hidden');

	input.addEventListener('input', async () => {
		if(input.value.length) {
			const tags = input.value.split(/\s+/);

			console.log(await pwm.getSecrets(tags));
		}
	});

	// await pwm.setPassword('https://cloud.digitalocean.com/', 'un1', 'pw1');
	// await pwm.setPassword('https://cloud.digitalocean.com/networking/domains', 'un2', 'pw2');

	// console.log(await pwm.getPassword('https://cloud.digitalocean.com/'));
	// console.log(await pwm.getPassword('https://cloud.digitalocean.com/', 'un2'));
})();
