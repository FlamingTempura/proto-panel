'use strict';

const { exec } = require('../../utils');
/*
let id, on, monitor;
let ready = exec('xinput', ['--list', '--long'])
	.then(data => {
		let lines = data.split('\n');
		let matchI = lines.findIndex(l => l.includes('↳ ELAN2'));
		console.log(lines[matchI]);
		if (matchI > -1) {
			on = !lines[matchI + 1].includes('disabled');
			id = Number(lines[matchI].match(/id=(\d+)/)[1]);
			console.log(on, id)
			monitor = spawn('xinput', ['--watch-props', id], { shell: true }); // THIS DOES NOT WORK
			monitor.stderr.on('data', d => {
				console.log('GOTT!!!!!!!!')
				let match = d.match(/Device Enabled \(.*\):\s+(\d)/);
				console.log(d, match)
				if (match) {
					on = Number(match[1]) === 1;
				}
			});
			monitor.on('error', (e) => console.log(e))
			monitor.on('exit', () => console.log('fuck'))
		}
	});

const api = {

	status() {
		return ready.then(() => ({ on }));
	},

	listen() {
		let cb;
		let newData = data => {
			data = data.toString();
			let match = data.match(/Device Enabled \(.*\):\s+(\d)/);
			if (match) {
				api.status().then(cb);
			}
		};
		return {
			listen: _cb => {
				cb = _cb;
				ready.then(() => {
					monitor.stdout.on('data', newData);
					api.status().then(cb);
				});
			},
			stopListening: () => monitor.stdout.removeListener('data', newData)
		};
	},

	toggle() {
		return api.status()
			.then(status => exec('xinput', [status.on ? '-disable' : '-enable', id]));
	}
};
*/



let listeners = [];

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

	listen() {
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
			.then(() => listeners.forEach(l => l()));
	}
};



module.exports = {
	applet: `${__dirname}/touchscreen-applet.html`,
	api
};