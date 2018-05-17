'use strict';

const EventEmitter = require('events');
const electron = require('electron');
const { exec } = require('../../utils');
const { spawn } = require('child_process');
const events = new EventEmitter();

const audio = {
	getDevices(type) {
		return exec('pactl', ['list', `${type}s`])
			.then(data => {
				//console.log('!!!!!!!!!', data)
				let m1 = data.match(/Volume:[^\/]+\/\s*(\d+)%/);
				return data.split(`S${type.slice(1)} #`).slice(1)
					.map(d => ({
						id: d.match(/^([0-9]+)/)[1],
						name: d.match(/Description: ([^\n]+)\n/)[1],
						active: d.includes('State: RUNNING') || d.includes('State: IDLE'),
						volume: Number(m1 && m1[1]),
						mute: !!data.match(/Mute:\s*yes/)
					}))
					.sort((a, b) => a.state < b.state); // running device goes first
			});
	},
	setVolume(type, id, volume) {
		return exec('pactl', [`set-${type}-volume`, id, volume]);
	},
	toggleMute(type, id, mute) {
		return exec('pactl', [`set-${type}-mute`, id, mute === undefined ? 'toggle' : mute ? 1 : 0]);
	},
	listen(type) {
		let cb;
		spawn('pactl', ['subscribe'], { shell: true }).stdout.on('data', data => {
			if (data.toString().includes(type)) {
				audio.getDevices(type).then(cb);
			}
		});
		audio.getDevices(type).then((data) => cb(data));
		return { listen: _cb => cb = _cb };
	},
	openMixer() {
		exec('pavucontrol');
	},
	openMenu() {
		let display = electron.screen.getAllDisplays()[0];
		let window = new electron.BrowserWindow({
			width: 300,
			height: 300,
			frame: false,
			transparent: true,
			y: 20,
			x: display.bounds.width - 300,
			focusable: true,
			resizable: false,
			titleBarStyle: 'hidden'
		});
		window.setMenu(null);
		window.loadURL(`file://${__dirname}/audio-menu.html`);
		//window.on('blur', () => window.close());
	}
};

module.exports = {
	applet: `${__dirname}/audio.html`,
	api: audio,
	init(panel) {
		//listenVolume();
		//volume('sink');
		//volume('source');
		events.on('volume-source', volume => {
			// clip the volume to the rings
			let clippedVol = volume.percent;
			if (volume.percent >= 45 && volume.percent < 65) {
				clippedVol = 53;
			}
			if (volume.percent >= 65 && volume.percent < 90) {
				clippedVol = 70;
			}
			if (volume.percent >= 90) {
				clippedVol = 100;
			}
			panel.js(`
				document.getElementById('audio').title = "${volume.mute ? 'Muted' : `Volume ${volume.percent}%` }";
				document.getElementById('vol-status').style.left = "${-100 + clippedVol}%";
				document.getElementById('vol-status-icon').style.left = "${100 - clippedVol}%";
				document.getElementById('vol-status-middle').style.left = "${-91 + clippedVol}%";
				document.getElementById('vol-status-middle-icon').style.left = "${91 - clippedVol}%";
				document.getElementById('vol-status-middle').style.display = "${!volume.mute && volume.percent > 50 ? 'block' : 'none'}";
				document.getElementById('vol-mute').style.display = "${volume.mute ? 'block' : 'none'}";
				document.getElementById('vol-status').style.display = "${!volume.mute ? 'block' : 'none'}";
				document.getElementById('vol-bg').style.display = "${!volume.mute ? 'block' : 'none'}";
			`);
		});

		audio.openMenu();

	}
};
