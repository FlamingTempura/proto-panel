'use strict';

const Bluebird = require('bluebird');
const { exec, parseTable } = require('../../utils');
const electron = require('electron');
const { createHash } = require('crypto');

const network = {
	// get network status
	netStatus() {
		return Bluebird
			.all([
				exec('nmcli', ['connection', 'show']).then(parseTable),
				exec('nmcli', ['device', 'wifi', 'list']).then(parseTable)
			])
			.then(([connections, wifis]) => {
				let connection = connections.find(row => row.DEVICE !== '--') || {};
				let wifi = wifis.find(wifi => wifi.SSID === connection.NAME) || {};
				return {
					type: connection.TYPE,
					name: connection.NAME,
					strength: Number(wifi.SIGNAL)
				};
			});
	},

	listen() {
		return {
			listen(cb) {
				setInterval(() => {
					network.netStatus().then(cb);
				}, 10000);
				network.netStatus().then(cb);
			}
		};
	},

	toggleWifi() {
		return exec('nmcli', ['radio', 'wifi'])
			.then(status => exec('nmcli', ['radio', 'wifi', status.includes('enabled') ? 'off' : 'on']));
	},

	listenWifiNetworks() {
		return {
			listen(cb) {
				setInterval(() => {
					network.getWifiNetworks().then(cb);
				}, 1000);
				network.getWifiNetworks().then(cb);
			}
		};
	},

	// get wifi networks 
	getWifiNetworks() {
		return exec('nmcli', ['radio', 'wifi'])
			.then(status => {
				if (!status.includes('enabled')) {
					return null;
				}
				return exec('nmcli', ['device', 'wifi', 'list'])
					.then(data => parseTable(data))
					.then(wifis => {
						return wifis.map(wifi => ({
							connected: wifi['IN-USE'] === '*',
							ssid: wifi.SSID,
							idHash: 'wifi-' + createHash('md5').update(wifi.SSID).digest('hex'),
							strength: Number(wifi.SIGNAL),
							security: wifi.SECURITY === '--' ? false : wifi.SECURITY
						}));
					});
			});
	},
	// connect/disconnect network
	// get VPNs
	// connect/disconnect VPN
	// launch network manager
	openManager() {
		return exec('nm-connection-editor');
	},

	openMenu() {
		let display = electron.screen.getAllDisplays()[0];
		let window = new electron.BrowserWindow({
			width: 300,
			height: 900,
			frame: false,
			transparent: true,
			y: 20,
			x: display.bounds.width - 300,
			focusable: true,
			resizable: false,
			titleBarStyle: 'hidden'
		});
		window.setMenu(null);
		window.loadURL(`file://${__dirname}/network-menu.html`);
		//window.on('blur', () => window.close());
	}
};

module.exports = {
	applet: `${__dirname}/network.html`,
	api: network
};