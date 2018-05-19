'use strict';

const electron = require('electron');
const { exec } = require('../../utils');
const { spawn } = require('child_process');
const Bluebird = require('bluebird');
const { createHash } = require('crypto');

let pactl = spawn('pactl', ['subscribe'], { shell: true }).stdout;

const audio = {
	getDevices(type) {
		return Bluebird
			.all([
				exec('pacmd', ['stat']),
				exec('pactl', ['list', `${type}s`])
			])
			.then(([stat, list]) => {
				let m = stat.match(new RegExp(`Default ${type} name: ([^\n]+)`)),
					defaultDevice = m && m[1];
				return list.split(`S${type.slice(1)} #`).slice(1)
					.map(d => {
						let m1 = d.match(/Volume:[^\/]+\/\s*(\d+)%/),
							m2 = d.match(/Name: ([^\n]+)/),
							name = m2 && m2[1],
							id = d.match(/^([0-9]+)/)[1];
						return {
							id,
							idHash: type + '-' + createHash('md5').update(id).digest('hex'), // can be safely used as an element id
							name,
							description: d.match(/Description: ([^\n]+)\n/)[1],
							active: name === defaultDevice,
							volume: Number(m1 && m1[1]),
							mute: !!d.match(/Mute:\s*yes/)
						};
					})
					.sort((a, b) => a.state < b.state); // running device goes first
			});
	},
	setDevice(type, id) {
		return exec('pactl', [`set-default-${type}`, id])
			.then(() => pactl.emit('data', `'change' on ${type}`)); // hack to force client to update
	},
	setVolume(type, id, volume) {
		return exec('pactl', [`set-${type}-volume`, id, `${volume}%`]);
	},
	toggleMute(type, id, mute) {
		return exec('pactl', [`set-${type}-mute`, id, mute === undefined ? 'toggle' : mute ? 1 : 0]);
	},
	listen(type) {
		let cb, prevData;
		let newData = data => {
			if (data.toString().includes(`'change' on ${type}`)) {
				audio.getDevices(type)
					.then(data => {
						if (JSON.stringify(data) !== JSON.stringify(prevData)) {
							cb(data);
							prevData = data;
						}
					});
			}
		};
		pactl.on('data', newData);
		audio.getDevices(type).then((data) => cb(data));
		return {
			listen: _cb => cb = _cb,
			stopListening: () => pactl.removeListener('data', newData)
		};
	},
	openMixer() {
		return exec('pavucontrol');
	},
	openMenu() {
		let display = electron.screen.getAllDisplays()[0];
		let window = new electron.BrowserWindow({
			width: 300,
			height: 500,
			frame: false,
			transparent: true,
			y: 24,
			x: display.bounds.width - 300,
			focusable: true,
			resizable: false,
			titleBarStyle: 'hidden',
			alwaysOnTop: true
		});
		window.setMenu(null);
		window.loadURL(`file://${__dirname}/audio-menu.html`);
		window.on('blur', () => window.close());
	}
};

module.exports = {
	applet: `${__dirname}/audio.html`,
	api: audio
};
