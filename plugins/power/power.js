'use strict';

const EventEmitter = require('events');
const events = new EventEmitter();
const Bluebird = require('bluebird');
const fs = Bluebird.promisifyAll(require('fs'));
const moment = require('moment');
const electron = require('electron');
const { exec } = require('../../utils');
const url = require('url');
const { throttle } = require('lodash');

const observations = [];
const interval = 500;
const estimatePeriod = 30000;

// get battery status
const batStatus = () => {
	return Bluebird
		.props({
			time: Date.now(), 	
			charge: fs.readFileAsync('/sys/class/power_supply/BAT0/charge_now', 'utf8')
				.then(charge => Number(charge)),
			charging: fs.readFileAsync('/sys/class/power_supply/BAT0/status', 'utf8')
				.then(status => status.trim() !== 'Discharging'),
			percent: fs.readFileAsync('/sys/class/power_supply/BAT0/capacity', 'utf8')
				.then(n => Number(n))
		})
		.then(battery => {
			let estimateLength = Math.min(estimatePeriod, observations.length * interval);
			let pastObservation = observations[observations.length - estimateLength / interval];
			if (pastObservation) {
				let lossPerMS = (battery.charge - pastObservation.charge) / estimateLength;
				let remaining = moment.duration(battery.charge / -lossPerMS, 'ms');
				battery.remaining = {
					hours: remaining.get('hours'),
					minutes: remaining.get('minutes')
				};
			}
			observations.push(battery);
			if (observations.length > 1000) {
				observations.shift();
			}
			events.emit('battery', battery);
		});
};

const getMaxBrightness = () => {
	return fs.readFileAsync('/sys/class/backlight/intel_backlight/max_brightness').then(Number);
};

// get brightness
const getBrightness = throttle(() => {
	return fs.readFileAsync('/sys/class/backlight/intel_backlight/brightness').then(Number);
}, 200);
// set brightness
const setBrightness = throttle(value => {
	value = Math.round(value);
	if (isNaN(value)) { return; }
	console.log(value);
	return fs.writeFileAsync('/sys/class/backlight/intel_backlight/brightness', String(Math.round(value)), 'utf8');
}, 200);
// launch power manager
const manager = () => exec('xfce4-power-manager-settings');

const menu = (x, y) => {
	let window = new electron.BrowserWindow({
		width: 300,
		height: 300,
		frame: false,
		transparent: true,
		y,
		x,
		focusable: true,
		resizable: false,
		titleBarStyle: 'hidden'
	});
	window.setMenu(null);
	window.loadURL(url.format({
		pathname: `${__dirname}/power-menu.html`,
		protocol: 'file:',
		slashes: true
	}));
	window.on('blur', () => {
		window.close();
	});
	let connected = new Bluebird(resolve => {
		electron.ipcMain.on('power.initiated', event => resolve(event.sender));
	});
	let ready = new Bluebird(resolve => {
		window.webContents.once('dom-ready', () => {
			resolve({
				js: code => window.webContents.executeJavaScript(code)
			});
		});
	});
	Bluebird.all([connected, ready, getMaxBrightness()])
		.then(([connection, menu, maxBrightness]) => {
			let closed;
			let update = () => {
				if (closed) { return; }
				connection.send('power.battery', observations[observations.length - 1]);
				getBrightness()
					.then(brightness => connection.send('power.getBrightness', brightness / maxBrightness));
			};
			let updateInterval = setInterval(update, 200);
			update();
			let _setBrightness = (e, factor) => setBrightness(factor * maxBrightness);
			electron.ipcMain.on('power.setBrightness', _setBrightness);
			window.on('close', () => {
				closed = true;
				electron.icpMain.off('power.setBrightness', _setBrightness);
				clearInterval(updateInterval);
			});
		});
};

module.exports = {
	applet: `${__dirname}/power.html`,
	init(panel) {
		events.on('battery', battery => {
			panel.js(`
				document.getElementById('power').title = "${battery.charging ? `${battery.percent}% charging` : `${battery.hours} hours and ${battery.minutes} minutes remaining (${battery.percent}%)`}";
				document.getElementById('bat-bg').className = "${!battery.charging && battery.percent < 10 ? 'red' : 'inactive'}";
				document.getElementById('bat-status').style.top = "${100 - battery.percent}%";
				document.getElementById('bat-status-icon').style.top = "${-100 + battery.percent}%";
				document.getElementById('bat-charging').style.display = "${battery.charging ? 'block' : 'none'}";
				document.getElementById('bat-critical').style.display = "${!battery.charging && battery.percent < 10 ? 'block' : 'none'}";
			`);
		});
		setInterval(batStatus, interval);
		batStatus();

		panel.on('power.menu', () => {
			let display = electron.screen.getAllDisplays()[0];
			menu(display.bounds.width - 300, 20);
		});
		panel.on('power.manager', () => manager());
	}
};