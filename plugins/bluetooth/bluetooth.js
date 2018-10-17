'use strict';

const electron = require('electron');
const bt = require('./bluetoothctl');

let menu;

const bluetooth = {
	changeListener() {
		let onControllers, onDevices;
		let prev;
		return {
			listen: cb => {
				let status = { on: false, connected: false };
				let cbIfChanged = () => {
					let str = JSON.stringify(status);
					if (str !== prev) {
						prev = str;
						cb(status);
					}
				};
				onControllers = controllers => {
					status.on = !!controllers.find(c => c.powered);
					cbIfChanged();
				};
				onDevices = devices => {
					status.connected = !!devices.find(d => d.connected);
					cbIfChanged();
				};
				onControllers(bt.controllers);
				onDevices(bt.devices);
				bt.on('controllers', onControllers);
				bt.on('devices', onDevices);
			},
			stopListening: () => {
				bt.off('controllers', onControllers);
				bt.off('devices', onDevices);
			}
		};
	},
	scan(value) {
		let on = bt.controllers.find(c => c.powered);
		if (on) {
			bt.scan(value);
		}
	},
	devicesListener() {
		let onDevices;
		return {
			listen: cb => {
				onDevices = cb;
				bt.on('devices', onDevices);
				onDevices(bt.devices);
			},
			stopListening: () => {
				bt.off('devices', onDevices);
			}
		};
	},
	controllersListener() {
		let onControllers;
		return {
			listen: cb => {
				onControllers = cb;
				bt.on('controllers', onControllers);
				onControllers(bt.controllers);
			},
			stopListening: () => {
				bt.off('controllers', onControllers);
			}
		};
	},
	toggle() {
		let on = bt.controllers.find(c => c.powered);
		return bt.power(!on).then(() => { console.log('ONE!!')});
	},
	pair(address) {
		return bt.pair(address);
	},
	unpair(address) {
		return bt.unpair(address);
	},
	openMenu() {
		menu.show();
	},
	menuListener() {
		return {
			listen(cb) {
				menu.on('show', () => cb(true));
				menu.on('hide', () => cb(false));
			}
		};
	}
};

module.exports = {
	applet: `${__dirname}/bluetooth-applet.html`,
	api: bluetooth,
	init() {
		let display = electron.screen.getAllDisplays()[0];
		menu = new electron.BrowserWindow({
			width: 300,
			height: 1000,
			frame: false,
			transparent: true,
			y: 24,
			x: display.bounds.width - 300,
			focusable: true,
			resizable: false,
			titleBarStyle: 'hidden',
			alwaysOnTop: true,
			show: false
		});
		menu.setMenu(null);
		menu.loadURL(`file://${__dirname}/bluetooth-menu.html`);
		menu.on('blur', () => menu.hide());
	}
};