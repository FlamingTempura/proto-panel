'use strict';

const { exec } = require('../../src/utils');

let listeners = [];

const applet = `${__dirname}/touchscreen-applet.html`;

const api = {

	status() {
		return exec('xinput', ['--list', '--long'])
			.then(data => {
				let lines = data.split('\n'),
					matchI = lines.findIndex(l => l.includes('↳ ELAN2'));
				if (matchI > -1) {
					let on = !lines[matchI + 1].includes('disabled'),
						id = Number(lines[matchI].match(/id=(\d+)/)[1]);
					return { on, id };
				}
			});
	},

	changeListener() {
		let cb,
			newData = () => api.status().then(cb);
		return {
			listen: _cb => {
				cb = _cb;
				listeners.push(newData);
				newData();
			},
			stopListening: () => listeners = listeners.filter(l => l !== newData)
		};
	},

	toggle() {
		return api.status()
			.then(status => exec('xinput', [status.on ? '-disable' : '-enable', status.id]))
			.then(() => listeners.forEach(cb => cb()));
	}
};

module.exports = { applet, api };