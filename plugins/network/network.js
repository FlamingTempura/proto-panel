'use strict';

const Bluebird = require('bluebird');
const { spawn } = require('child_process');
const { exec, parseTable } = require('../../utils');
const electron = require('electron');
const { createHash } = require('crypto');

let monitor = spawn('nmcli monitor', { shell: true });

const parseTerse = text => {
	let arr = [],
		o = {};
	text.split('\n').forEach(line => {
		if (line.trim() === '') {
			arr.push(o);
			o = {};
		} else {
			let [key, val] = line.split(':', 2);
			o[key] = val;
		}
	});
	return arr;
};

const network = {

	// get wifi networks 
	getWifiNetworks() {
		return exec('nmcli', ['radio', 'wifi'])
			.then(status => {
				if (!status.includes('enabled')) {
					return null;
				}
				return Bluebird
					.all([
						exec('nmcli', ['dev', 'wifi', 'list']).then(parseTable),
						exec('nmcli', ['con', 'show']).then(parseTable)
					])
					.then(([wifis, connections]) => {
						return wifis.map(wifi => {
							let connection = connections.find(c => c.NAME === wifi.SSID);
							return {
								connected: wifi['IN-USE'] === '*',
								uuid: connection && connection.UUID,
								ssid: wifi.SSID,
								idHash: 'wifi-' + createHash('md5').update(wifi.SSID).digest('hex'),
								strength: Number(wifi.SIGNAL),
								security: wifi.SECURITY === '--' ? false : wifi.SECURITY
							};
						});
					});
			});
	},

	// get network status
	netStatus() {
		return Bluebird
			.all([
				exec('nmcli', ['-t', 'device', 'show']).then(parseTerse),
				exec('nmcli', ['dev', 'wifi', 'list']).then(parseTable)
			])
			.then(([devices, wifis]) => {
				// sort devices by their connection status (30 disconnected, 50 connecting, 100 connected)
				devices = devices.sort((a, b) => parseInt(b['GENERAL.STATE']) - parseInt(a['GENERAL.STATE']));
				let connection = devices[0] || {},
					status = connection['GENERAL.STATE'].includes('(connected') ? 'connected' :
							connection['GENERAL.STATE'].includes('(connecting') ? 'waiting' : 'disconnected',
					wifi = wifis.find(wifi => wifi.SSID === connection['GENERAL.CONNECTION']) || {};
				return {
					status,// connected, disconnected, waiting
					type: connection['GENERAL.TYPE'],
					name: connection['GENERAL.CONNECTION'],
					strength: Number(wifi.SIGNAL)
				};
			});
	},

	listen() {
		let cb;
		let newData = data => {
			data = data.toString();
			let match = data.match(/'([^']+)' state/);
			if (match) {
				network.netStatus().then(cb);
			}
		};
		monitor.stdout.on('data', newData);
		return {
			listen: _cb => {
				cb = _cb;
				network.netStatus().then(cb);
			},
			stopListening: () => monitor.stdout.removeListener('data', newData)
		};
	},

	toggleWifi() {
		return exec('nmcli', ['radio', 'wifi'])
			.then(status => exec('nmcli', ['radio', 'wifi', status.includes('enabled') ? 'off' : 'on']));
	},

	connectWifi(ssid) {
		return exec('nmcli', ['con', 'show'])
			.then(parseTable)
			.then(connections => {
				let connection = connections.find(c => c.NAME === ssid);
				if (connection) {
					return exec('nmcli', ['con', 'up', connection.UUID]);
				} else {
					return exec('nmcli', ['dev', 'wifi', 'connect', ssid]);
				}
			});
	},

	disconnectWifi() {
		return network.netStatus()
			.then(status => {
				return exec('nmcli', ['connection', 'down', status.name]);
			});
	},

	scanWifi() {
		return exec('nmcli', ['dev', 'wifi', 'rescan']);
	},

	listenWifiNetworks() {
		let cb,
			i = 0;
		let scan = () => {
			if (!cb) { return; } // stopped listening
			network.getWifiNetworks().then(cb);
			if (i % 4 === 0) {
				network.scanWifi();
			}
			i++;
			setTimeout(scan, 4000);
		};
		return {
			listen: cb_ => {
				cb = cb_;
				scan();
			},
			stopListening: () => cb = null
		};
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
			y: 24,
			x: display.bounds.width - 300,
			focusable: true,
			resizable: false,
			titleBarStyle: 'hidden'
		});
		window.setMenu(null);
		window.loadURL(`file://${__dirname}/network-menu.html`);
		window.on('blur', () => window.close());
	}
};

module.exports = {
	applet: `${__dirname}/network.html`,
	api: network
};