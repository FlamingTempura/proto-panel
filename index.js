'use strict';

const Bluebird = require('bluebird');
const fs = Bluebird.promisifyAll(require('fs'));
const electron = require('electron');
const chalk = require('chalk');

const config = {
	height: 22,
	plugins: ['touchscreen', 'bluetooth', 'audio', 'network', 'power', 'clock']
};

const plugins = {};
config.plugins.forEach(name => {
	let plugin = require(`./plugins/${name}`);
	plugins[name] = plugin;
});

let readyResolve;
const ready = new Bluebird(resolve => readyResolve = resolve);
electron.app.on('ready', () => readyResolve());

Bluebird
	.all([
		ready,
		fs.readFileAsync(`${__dirname}/panel.html`, 'utf8')
			.then(panelHTML => {
				panelHTML = panelHTML.replace(/(<!--BEGIN-->)[\w\W](<!--END-->)/, '$1$2');
				return Bluebird
					.mapSeries(Object.values(plugins), plugin => {
						return fs.readFileAsync(plugin.applet, 'utf8')
							.then(html => {
								panelHTML = panelHTML.replace(/(<!--APPLETS-->)/, `${html}$1`);
							});
					})
					.then(() => fs.writeFileAsync(`${__dirname}/.panel.html`, panelHTML));
			})
	])
	.then(() => {
		let display = electron.screen.getAllDisplays()[0];
		let window = new electron.BrowserWindow({
			width: 600,
			height: config.height,
			frame: false,
			y: 0,
			x: display.bounds.width - 600,
			alwaysOnTop: true,
			focusable: false,
			resizable: false,
			thickFrame: true,
			transparent: true,
			webPreferences: {
			}
		});
		electron.ipcMain.on('log', (e, msg) => {
			console.log(chalk.cyan.bold('client:'), ...msg);
		});
		electron.ipcMain.on('getAPI', (e, id, name) => {
			e.sender.send(`getAPI#${id}`, Object.keys(plugins[name].api));
		});
		electron.ipcMain.on('setSize', (e, width) => {
			window.setSize(width, config.height);
			window.setPosition(display.bounds.width - width, 0);
		});
		Object.entries(plugins).forEach(([name, plugin]) => {
			if (plugin.api) {
				Object.entries(plugin.api).forEach(([k, fn]) => {
					electron.ipcMain.on(`${name}.${k}`, (e, id, ...args) => {
						let data = fn(...args),
							cb = result => {
								try {
									e.sender.send(`${name}.${k}#${id}`, result);
								} catch (e) {
									// sender has gone (window has been closed)
									if (data.stopListening) {
										data.stopListening();
									}
								}
							};
						if (data && data.listen) {
							data.listen(cb);
						} else if (data && data.then) {
							data.then(cb);
						} else {
							cb(data);
						}
					});
				});
			}
		});
		window.loadURL(`file://${__dirname}/.panel.html`);
	});