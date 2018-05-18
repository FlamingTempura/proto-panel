'use strict';

const Bluebird = require('bluebird');
const fs = Bluebird.promisifyAll(require('fs'));
const moment = require('moment');
const electron = require('electron');
const { exec, watch } = require('../../utils');
const { throttle } = require('lodash');

const observations = [];
const interval = 500;
const estimatePeriod = 30000;
const batteryRoot = '/sys/class/power_supply/BAT0';
const backlightRoot = '/sys/class/backlight/intel_backlight';

const power = {
	battery() {
		return {
			listen(cb) {
				let update = () => power.getBattery().then(cb);
				watch(`${batteryRoot}/capacity`, update);
				watch(`${batteryRoot}/status`, update);
				update();
			}
		};
	},
	brightness() {
		return {
			listen(cb) {
				let update = () => power.getBrightness().then(cb);
				watch(`${backlightRoot}/brightness`, update);
				update();
			}
		};
	},
	openPowerManager() {
		return exec('xfce4-power-manager-settings');
	},
	getBattery() {
		return Bluebird
			.props({
				time: Date.now(), 	
				charge: fs.readFileAsync(`${batteryRoot}/charge_now`, 'utf8')
					.then(charge => Number(charge)),
				charging: fs.readFileAsync(`${batteryRoot}/status`, 'utf8')
					.then(status => status.trim() !== 'Discharging'),
				percent: fs.readFileAsync(`${batteryRoot}/capacity`, 'utf8')
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
				return battery;
			});
	},
	getMaxBrightness() {
		return fs.readFileAsync(`${backlightRoot}/max_brightness`).then(Number);
	},

	getBrightness() {
		return fs.readFileAsync(`${backlightRoot}/brightness`).then(Number);
	},

	setBrightness: throttle(value => {
		// TODO: lock file for writing
		value = Math.round(value);
		if (isNaN(value)) { return; }
		console.log(value);
		return fs.writeFileAsync(`${backlightRoot}/brightness`, String(Math.round(value)), 'utf8');
	}, 200),

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
			titleBarStyle: 'hidden',
			alwaysOnTop: true
		});
		window.setMenu(null);
		window.loadURL(`file://${__dirname}/power-menu.html`);
		//window.on('blur', () => window.close());
	}
};

module.exports = {
	applet: `${__dirname}/power.html`,
	api: power
};