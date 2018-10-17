'use strict';

const electron = require('electron');
const fs = require('fs');
const chalk = require('chalk');

const CONFIG = {
	height: 22,
	plugins: ['touchscreen', 'bluetooth', 'network', 'audio', 'power', 'clock'] //, , 
};

let html = fs.readFileSync(`${__dirname}/panel.html`, 'utf8');
let css = fs.readFileSync(`${__dirname}/style.css`, 'utf8');

html = html.replace('/*STYLE*/', css);

const plugins = [];
CONFIG.plugins.forEach(name => {
	let plugin = require(`../plugins/${name}`);
	plugin.name = name;
	plugins.push(plugin);
	let applet = fs.readFileSync(plugin.applet, 'utf8');
	html = html.replace(/(<!--APPLETS-->)/, `${applet}$1`);
});

electron.app.disableHardwareAcceleration();
electron.app.whenReady().then(() => {
	let display = electron.screen.getAllDisplays()[0];
	let window = new electron.BrowserWindow({
		width: 600,
		height: CONFIG.height,
		frame: false,
		y: 0,
		x: display.bounds.width - 600,
		alwaysOnTop: true,
		focusable: false,
		resizable: false,
		transparent: true
	});

	console.log(`file://${__dirname}/`)
	
	window.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(html), {
		baseURLForDataURL: `file://${__dirname}/`
	});

	electron.ipcMain.on('log', (e, msg) => {
		msg = msg.map(msg => {
			if (typeof msg === 'string') {
				msg = msg.replace('power.', chalk.magentaBright('power') + '.');
				msg = msg.replace('touchscreen.', chalk.greenBright('touchscreen') + '.');
				msg = msg.replace('clock.', chalk.cyanBright('clock') + '.');
				msg = msg.replace('audio.', chalk.yellowBright('audio') + '.');
				msg = msg.replace('bluetooth.', chalk.blueBright('bluetooth') + '.');
				msg = msg.replace(/(#\d+$)/, chalk.gray('$1'));
			}
			return msg;
		});
		console.log(chalk.cyan.bold('client:'), ...msg);
	});
	electron.ipcMain.on('getAPI', (e, id, name) => {
		let plugin = plugins.find(p => p.name === name);
		e.sender.send(`getAPI#${id}`, Object.keys(plugin.api));
	});
	electron.ipcMain.on('setSize', (e, width) => {
		window.setSize(width, CONFIG.height);
		window.setPosition(display.bounds.width - width, 0);
	});
	plugins.forEach(plugin => {
		if (plugin.api) {
			Object.entries(plugin.api).forEach(([k, fn]) => {
				electron.ipcMain.on(`${plugin.name}.${k}`, (e, id, ...args) => {
					let data = fn(...args),
						cb = result => {
							try {
								e.sender.send(`${plugin.name}.${k}#${id}`, result);
							} catch (e) {
								// sender has gone (window has been closed)
								if (data.stopListening) {
									data.stopListening();
								}
							}
						};
					if (data && data.listen) {
						electron.ipcMain.on(`${plugin.name}.${k}.stop`, (e, id_) => {
							if (id === id_) {
								console.log('stopped listening');
								data.stopListening();
							}
						});
						data.listen(cb);
					} else if (data && data.then) {
						data.then(cb);
					} else {
						cb(data);
					}
				});
			});
		}
		if (plugin.init) {
			plugin.init();
		}
	});
});
