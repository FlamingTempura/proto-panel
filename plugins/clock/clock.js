'use strict';

const moment = require('moment');
const electron = require('electron');

let menu;
electron.app.whenReady().then(() => {
	let display = electron.screen.getAllDisplays()[0];
	menu = new electron.BrowserWindow({
		width: 300,
		height: 300,
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
	menu.loadURL(`file://${__dirname}/calendar.html`);
	menu.on('blur', () => menu.hide());
});

module.exports = {
	applet: `${__dirname}/clock.html`,
	api: {
		changeListener() {
			let cb;
			const time = () => {
				if (!cb) { return; } // stopped listening
				cb(moment().format('ddd DD MMM HH:mm'));
				setTimeout(time, 60500 - Date.now() % 60000); // let it lag a little to ensure clock is on the right side of the minute
			};
			return {
				listen: (cb_) => {
					cb = cb_;
					time();
				},
				stopListening: () => cb = null
			};
		},
		showCalendar() {
			menu.show();
		}
	}
};
