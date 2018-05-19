'use strict';

const { spawn } = require('child_process');
const electron = require('electron');
const Bluebird = require('bluebird');
const { createHash } = require('crypto');

let bluetoothctl = spawn('bluetoothctl', { shell: true });

const cmd = cmd => {
	return new Bluebird(resolve => {
		bluetoothctl.stdout.on('data', resolve);
		bluetoothctl.stdin.write(`${cmd}\n`);
	});
};

const cmdReturn = cmd => {
	return new Bluebird(resolve => {
		console.log('cmd', cmd)
		let child = spawn('bluetoothctl', { shell: true }),
			result = '';
		child.stdout.on('data', data => result += data.toString());
		child.stdout.on('close', () => resolve(result));
		child.stdin.write(`${cmd}\nquit\n`);
	});
};

const bluetooth = {
	listen() {
		let cb;
		let newData = data => {
			data = data.toString();
			if (data.includes('Powered') || data.includes('Connected')) {
				bluetooth.status().then(status => cb(status));
			}
		};
		bluetoothctl.stdout.on('data', newData);
		bluetooth.status().then(status => cb(status));
		return {
			listen: _cb => cb = _cb,
			stopListening: () => bluetoothctl.stdout.removeListener('data', newData)
		};
	},
	toggle() {
		return bluetooth.status().then(status => {
			return cmd(`power ${status.on ? 'off' : 'on'}`);
		});
	},
	scan() {
		return cmd('scan on')
			.then(() => Bluebird.all([cmdReturn('devices'), cmdReturn('paired-devices')]))
			.then(([devicesout, pairedout]) => {
				let devices = [];
				devicesout.split('\n').forEach(line => {
					let match = line.match('Device ([^\s]+) ([^\n]+)');
					if (match) {
						devices.push({
							idHash: 'b-' + createHash('md5').update(match[1]).digest('hex'), // can be safely used as an element id
							address: match[1],
							name: match[2]
						});
					}
				});
				pairedout.split('\n').forEach(line => {
					let match = line.match('Device ([^\s]+) ([^\n]+)');
					if (match) {
						let address = match[1];
						let device = devices.find(d => d.address === address);
						if (!device) {
							let device = {
								idHash: 'b-' + createHash('md5').update(match[1]).digest('hex'), // can be safely used as an element id
								address,
								name: match[2]
							};
							devices.push(device);
						}
						device.paired = true;
					}
				});
				return devices;
			});
	},
	connect(address) {
		return cmdReturn(`power on`)
			.then(() => cmdReturn(`connect ${address}`));
	},
	listenScan() {
		let cb;
		let scan = () => bluetooth.scan().then(data => cb(data));
		let timer = setInterval(scan, 10000);
		scan();
		return {
			listen: _cb => cb = _cb,
			stopListening: () => clearTimeout(timer)
		};
	},
	status() {
		return Bluebird
			.all([cmdReturn('show'), cmdReturn('info')])
			.then(([controller, device]) => {
				let on = !!controller.match('Powered: yes');
				let connected = !!device.match('Connected: yes');
				return { on, connected };
			});
	},
	openMenu() {
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
		window.loadURL(`file://${__dirname}/bluetooth-menu.html`);
		window.on('blur', () => window.close());
	}
};

module.exports = {
	applet: `${__dirname}/bluetooth-applet.html`,
	api: bluetooth
};