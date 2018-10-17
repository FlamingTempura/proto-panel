'use strict';

const Bluebird = require('bluebird');
const { spawn } = require('child_process');
const { exec, parseTable } = require('../../src/utils');
const electron = require('electron');
const { createHash } = require('crypto');

let monitor = spawn('nmcli monitor', { shell: true }),
	menu;

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

	getStatus() {
		return Bluebird
			.all([
				exec('nmcli', ['-t', 'device', 'show']).then(parseTerse),
				exec('nmcli', ['con', 'show']).then(parseTable),
				exec('nmcli', ['radio', 'wifi']),
				exec('nmcli', ['dev', 'wifi', 'list']).then(parseTable)
			])
			.spread((devices, connections, wifiStatus, wifis) => {
				let vpn = connections.find(c => c.TYPE === 'vpn' && c.DEVICE !== '--');

				// sort devices by their connection status (30 disconnected, 50 connecting, 100 connected)
				devices = devices
					.filter(d => d['GENERAL.TYPE'] !== 'tun') // filter out vpn tunnels
					.sort((a, b) => parseInt(b['GENERAL.STATE']) - parseInt(a['GENERAL.STATE']));

				let device = devices[0] || {},
					status = device['GENERAL.STATE'].includes('(connected') ? 'connected' :
							device['GENERAL.STATE'].includes('(connecting') ? 'waiting' : 'disconnected',
					wifi = wifis.find(wifi => wifi.SSID === device['GENERAL.CONNECTION']) || {},
					connection = connections.find(c => c.NAME === device['GENERAL.CONNECTION']) || {};

				return {
					wifiOn: wifiStatus.includes('enabled'),
					status, // connected, disconnected, waiting
					type: device['GENERAL.TYPE'],
					name: device['GENERAL.CONNECTION'],
					uuid: connection.UUID,
					strength: Number(wifi.SIGNAL),
					vpn: vpn && vpn.UUID
				};
			});
	},

	changeListener() {
		let cb;
		let newData = data => {
			data = data.toString();
			let connectionChange = data.match(/'([^']+)' state/),
				vpnChange = data.includes('connected') || data.includes('removed');
			if (connectionChange || vpnChange) {
				network.getStatus().then(cb);
			}
		};
		monitor.stdout.on('data', newData);
		return {
			listen: _cb => {
				cb = _cb;
				network.getStatus().then(cb);
			},
			stopListening: () => monitor.stdout.removeListener('data', newData)
		};
	},

	getNetworks() {
		return Bluebird
			.all([
				exec('nmcli', ['dev', 'wifi', 'list']).then(parseTable),
				exec('nmcli', ['con', 'show']).then(parseTable)
			])
			.then(([wifis, connections]) => {
				let networks = [];
				connections.forEach(c => {
					if (c.TYPE === 'vpn') {
						networks.push({
							type: 'vpn',
							uuid: c.UUID,
							idHash: 'vpn-' + createHash('md5').update(c.UUID).digest('hex'),
							name: c.NAME,
							connected: c.DEVICE !== '--'
						});
					}
				});
				wifis.map(wifi => {
					let connection = connections.find(c => c.NAME === wifi.SSID);
					networks.push({
						type: 'wifi',
						uuid: connection && connection.UUID,
						name: wifi.SSID,
						idHash: 'wifi-' + createHash('md5').update(wifi.SSID).digest('hex'),
						strength: Number(wifi.SIGNAL),
						security: wifi.SECURITY === '--' ? false : wifi.SECURITY,
						connected: wifi['IN-USE'] === '*'
					});
				});
				return networks;
			});
	},

	networksListener() {
		let cb,
			i = 0;
		let scan = () => {
			if (!cb) { return; } // stopped listening
			network.getNetworks().then(cb);
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
	connect(uuid) {
		return exec('nmcli', ['con', 'up', uuid]);
	},

	disconnect(uuid) { // also accepts SSID
		return exec('nmcli', ['con', 'down', uuid]);
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
					return network.connect(connection.UUID);
				} else {
					return exec('nmcli', ['dev', 'wifi', 'connect', ssid]);
				}
			});
	},

	scanWifi() {
		return exec('nmcli', ['dev', 'wifi', 'rescan']);
	},

 
	// connect/disconnect network
	// get VPNs
	// connect/disconnect VPN
	// launch network manager
	openManager() {
		return exec('nm-connection-editor');
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
	applet: `${__dirname}/network.html`,
	api: network,
	init() {
		let display = electron.screen.getAllDisplays()[0];
		menu = new electron.BrowserWindow({
			width: 300,
			height: 900,
			frame: false,
			transparent: true,
			y: 24,
			x: display.bounds.width - 300,
			focusable: true,
			resizable: false,
			titleBarStyle: 'hidden',
			show: false
		});
		menu.setMenu(null);
		menu.loadURL(`file://${__dirname}/network-menu.html`);
		menu.on('blur', () => menu.hide());
		/*electron.ipcMain.on('on', (e, event) => {
			menu.on(event, () => {
				e.sender.send(`on:${event}`);
			});
		});*/
	}
};