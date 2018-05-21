'use strict';

const moment = require('moment');
const electron = require('electron');

module.exports = {
	applet: `${__dirname}/clock.html`,
	api: {
		time() {
			return {
				listen: cb => {
					const time = () => {
						cb(moment().format('ddd DD MMM HH:mm'));
						setTimeout(time, 60500 - Date.now() % 60000); // let it lag a little to ensure clock is on the right side of the minute
					};
					time();
				}
			};
		},
		showCalendar() {
			let display = electron.screen.getAllDisplays()[0];
			let window = new electron.BrowserWindow({
				width: 300,
				height: 300,
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
			window.loadURL(`file://${__dirname}/calendar.html`);
			window.on('blur', () => window.close());
		}
	}
};
