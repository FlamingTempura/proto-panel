'use strict'

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

const plugins = config.plugins.map(p => {
	let plugin = require(`./plugins/${p}`);
	plugin.name = p;
	return plugin;
});

let readyResolve;
const ready = new Bluebird(resolve => readyResolve = resolve);
electron.app.on('ready', () => readyResolve());

const createPanel = () => {
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
	window.loadURL(url.format({
		protocol: 'file:',
		pathname: path.join(__dirname, '.panel.html'),
		slashes: true
	}));
	electron.ipcMain.on('log', (e, msg) => {
		console.log(chalk.cyan.bold('client:'), ...msg)
	});
	return new Bluebird(resolve => {
		window.webContents.once('dom-ready', () => {
			resolve({
				js: (...args) => window.webContents.executeJavaScript(...args),
				on: (...args) => electron.ipcMain.on(...args)
			});
		});
	});
};

fs.readFileAsync(`${__dirname}/panel.html`, 'utf8')
	.then(panelHTML => {
		panelHTML = panelHTML.replace(/(<!--BEGIN-->)[\w\W](<!--END-->)/, '$1$2');
		return Bluebird
			.mapSeries(plugins, plugin => {
				return fs.readFileAsync(plugin.applet, 'utf8')
					.then(html => {
						panelHTML = panelHTML.replace(/(<!--APPLETS-->)/, `${html}$1`);
					});
			})
			.then(() => fs.writeFileAsync(`${__dirname}/.panel.html`, panelHTML))
	})
	.then(ready)
	.then(() => createPanel())
	.then(panel => {
		plugins.forEach(plugin => {
			if (plugin.api) {
				Object.entries(plugin.api).forEach(([k, fn]) => {
					panel.on(`${plugin.name}.${k}`, (e, id, ...args) => {
						let data = fn(...args),
							cb = data => e.sender.send(`${plugin.name}.${k}.${id}`, data);
						if (data.listen) {
							data.listen(cb);
						} else if (data.then) {
							data.then(cb);
						} else {
							cb(data);
						}
					});
				});
				panel.on(plugin.name, e => e.sender.send(`${plugin.name}.api`, Object.keys(plugin.api)));
			}
			plugin.init(panel);
		});
	});