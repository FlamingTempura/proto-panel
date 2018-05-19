'use strict';

const Bluebird = require('bluebird');
const fs = Bluebird.promisifyAll(require('fs'));
const moment = require('moment');
const electron = require('electron');
const { exec, watch } = require('../../utils');
const { throttle } = require('lodash');

const batteryRoot = '/sys/class/power_supply/BAT0';
const backlightRoot = '/sys/class/backlight/intel_backlight';

const power = {
	battery() {
		return {
			listen(cb) {
				let update = () => power.getBattery().then(cb);
				setInterval(update, 20000);
				watch(`${batteryRoot}/status`, update, 500);
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
	getMaxCapacity() {
		return fs.readFileAsync(`${batteryRoot}/charge_full`, 'utf8').then(Number);
	},
	getBattery() {
		return Bluebird
			.props({
				charge: fs.readFileAsync(`${batteryRoot}/charge_now`, 'utf8').then(Number),
				charging: fs.readFileAsync(`${batteryRoot}/status`, 'utf8')
					.then(status => status.trim() !== 'Discharging'),
				percent: fs.readFileAsync(`${batteryRoot}/capacity`, 'utf8').then(Number)
			})
			.then(battery => {
				let remaining = moment.duration(endTime - Date.now(), 'ms');
				battery.hours = remaining.get('hours');
				battery.minutes = remaining.get('minutes');
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

// used for calculating time remaining
let observations, currentState, endTime;

power.getMaxCapacity()
	.then(maxCapacity => {
		let computeTimeRemaining = () => {
			power.getBattery()
				.then(battery => {
					let time = Date.now();
					if (currentState !== battery.charging) {
						observations = [];
						endTime = undefined;
						currentState = battery.charging;
					}
					let observation = { time, charge: battery.charge },
						prev = observations[observations.length - 1];
					observations.push(observation);
					if (observations.length > 10) {
						observations.shift();
					}
					if (prev) {
						let deltaTime = time - prev.time,
							deltaCharge = battery.charge - prev.charge;
						observation.chargeRate = deltaCharge / deltaTime;
						let avgChargeRate = observations.slice(1).reduce((sum, o) => sum + o.chargeRate, 0) / observations.length;
						let endTime_;
						if (battery.charging) {
							endTime_ = time + (maxCapacity - battery.charge) / avgChargeRate;
						} else {
							endTime_ = time + battery.charge / -avgChargeRate;
						}
						if (endTime_ > time) {
							endTime = endTime_; // correct for calculation errors due to imprecision
						}
					}
				});
		};

		computeTimeRemaining();
		setTimeout(computeTimeRemaining, 2000);
		setTimeout(computeTimeRemaining, 10000); // gradually calculate time remaining with increasing accuracy
		setInterval(computeTimeRemaining, 20000);
	});

module.exports = {
	applet: `${__dirname}/power.html`,
	api: power
};