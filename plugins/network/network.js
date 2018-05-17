const EventEmitter = require('events');
const events = new EventEmitter();
const Bluebird = require('bluebird');
const fs = Bluebird.promisifyAll(require('fs'));
const { exec, parseTable } = require('../../utils');
const electron = require('electron');
const url = require('url');

// get network status
let netStatus = () => {
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
		})
		.then(connection => events.emit('net', connection));
};

// get wifi networks 
let getWifiNetworks = () => {
	return exec('nmcli', ['device', 'wifi', 'list'])
		.then(data => parseTable(data))
		.then(wifis => {
			return wifis.map(wifi => ({
				connected: wifi['IN-USE'] === '*',
				ssid: wifi.SSID,
				strength: Number(wifi.SIGNAL),
				security: wifi.SECURITY === '--' ? false : wifi.SECURITY
			}));
		});
};
// connect/disconnect network
// get VPNs
// connect/disconnect VPN
// launch network manager
const networkManager = () => exec('nm-connection-editor');

const menu = () => {
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
	window.loadURL(url.format({
		pathname: `${__dirname}/network-menu.html`,
		protocol: 'file:',
		slashes: true
	}));
	window.on('blur', () => {
		window.close();
	})
	let connected = new Bluebird(resolve => {
		electron.ipcMain.on('network:initiated', event => resolve(event.sender));
	});
	let ready = new Bluebird(resolve => {
		window.webContents.once('dom-ready', () => {
			resolve({
				js: code => window.webContents.executeJavaScript(code)
			});
		});
	});
	Bluebird.all([connected, ready, getWifiNetworks()])
		.then(([connection, menu, wifis]) => {
			console.log(wifis);
			connection.send('network:wifis', wifis);
		});
};

module.exports = {
	applet: `${__dirname}/network.html`,
	init(panel) {
		events.on('net', net => {
			panel.js(`
				document.getElementById('network').title = "${`Connected to ${net.name}` || 'Not connected'}";
				document.getElementById('net-none').style.display = "${!net.type ? 'block' : 'none'}";
				document.getElementById('net-wifi').style.display = "${net.type === 'wifi' ? 'block' : 'none'}";
				document.getElementById('net-wifi-status').style.display = "${net.type === 'wifi' ? 'block' : 'none'}";

				document.getElementById('net-wifi-status').style.top = "${100 - net.strength}%";
				document.getElementById('net-wifi-status-icon').style.top = "${-100 + net.strength}%";
			`);
		});
		setInterval(netStatus, 500);
		netStatus();

		panel.on('network:menu', (e, msg) => menu());
		panel.on('network:manager', (e, msg) => networkManager());
	}
};