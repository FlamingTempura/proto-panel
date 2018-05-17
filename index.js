'use strict';

const Bluebird = require('bluebird');
const fs = Bluebird.promisifyAll(require('fs'));
const electron = require('electron');
const path = require('path');
const url = require('url');
const chalk = require('chalk');

const config = {
	width: 740,
	height: 22,
	plugins: ['audio', 'network', 'power', 'clock']
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
			width: config.width,
			height: config.height,
			frame: false,
			y: 0,
			x: display.bounds.width - config.width -400,
			alwaysOnTop: true,
			focusable: false,
			resizable: false,
			thickFrame: true
		});
		electron.ipcMain.on('log', (e, msg) => {
			console.log(chalk.cyan.bold('client:'), ...msg);
		});
		electron.ipcMain.on('getAPI', (e, id, name) => {
			e.sender.send(`getAPI#${id}`, Object.keys(plugins[name].api));
		});
		Object.entries(plugins).forEach(([name, plugin]) => {
			if (plugin.api) {
				Object.entries(plugin.api).forEach(([k, fn]) => {
					electron.ipcMain.on(`${name}.${k}`, (e, id, ...args) => {
						let data = fn(...args),
							cb = data => e.sender.send(`${name}.${k}#${id}`, data);
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