'use strict';

const { createHash } = require('crypto');

/*
bluetoothctl is a linux tool to interact with bluetooth.

bluetooth.power(on)
 power on (if true) or off (if false). Returns promise.

bluetooth.scan()
 Start scanning for devices. Use event listeners 
 Returns a cancellable promise. When cancelled, scanning will cease.

bluetooth.devices()
 list of known devices

bluetooth.pair(address)
 trust, pair, and connect to a device

bluetooth.unpair(address)
 forget and disconnect from a device

bluetooth.on(event, cb)
 events:
 - device: (device)
 - devices
 - controller: (controller)
 - controllers

*/

const { spawn } = require('child_process');
const chalk = require('chalk');

let bluetoothctl = spawn('bluetoothctl', { shell: true });

const controllers = [];
const devices = [];
const listeners = {};

const trigger = (event, ...args) => {
	//console.log('evt', event)
	let callbacks = listeners[event] || [];
	callbacks.forEach(callback => callback(...args));
};

const on = (event, callback) => {
	if (!listeners[event]) { listeners[event] = []; }
	listeners[event].push(callback);
};

const off = (event, callback) => {
	let callbacks = listeners[event] || [],
		i = callbacks.indexOf(callback);
	if (i > -1) { callbacks.splice(i, 1); }
};

const cmd = cmd => {
	console.log(chalk.cyan(`[bluetoothctl] $ ${cmd}`));
	bluetoothctl.stdin.write(`${cmd}\n`);
};

const power = (value = true) => new Promise(resolve => {
	cmd(`power ${value ? 'on': 'off'}`);
	let callback = controller => {
		if (controller.powered === value) {
			off('controller', callback);
			resolve();
		}
	};
	on('controller', callback);
});

// note, scanning causes laggyness with bluetooth mouse and stuttering audio,
// so it should be turned off when done
const scan = (value = true) => new Promise(resolve => {
	if (value) { cmd(`power on`); }
	cmd(`scan ${value ? 'on': 'off'}`);
	let callback = controller => {
		if (controller.discovering === value) {
			off('controller', callback);
			resolve();
		}
	};
	on('controller', callback);
});

const pair = address => new Promise(resolve => {
	let device = devices.find(d => d.address === address);
	device.pending = true;

	cmd(`unblock ${address}`);
	cmd(`pair ${address}`); // pairing before connecting is necessary for reconnects later on
	cmd(`connect ${address}`); // pairing doesn't always auto-connect for some reason
	cmd(`trust ${address}`); // trust is necessary for successfully connecting next time (otherwise bluetooth will ask to authorise the service)

	let callback = device => {
		if (device.address === address) {
			off('device', callback);
			device.pending = false;
			resolve();
		}
	};
	on('device', callback);
});

const unpair = address => new Promise(resolve => {
	let device = devices.find(d => d.address === address),
		callback = () => {
			off('device-removed', callback);
			let i = devices.findIndex(d => d.address === address);
			if (i > -1) { devices.splice(i, 1); }
			trigger('devices', devices);
			resolve();
		};
	device.pending = true;
	on('device-removed', callback);
	cmd(`remove ${address}`);
});

let prevLine = '';
bluetoothctl.stdout.on('data', (data) => {
	data = data.toString().replace(/\x1b\[[0-9;]*m/g, ''); // remove colour codes (e.g. ^[[37m)
	data = data.replace(/\r/g, ''); // remove carriage returns

	data.split('\n').forEach(line => {

		if (line.trim() === '') { return;}

		line = line.replace(/^\t/, prevLine);

		line = line.replace(/\s+/g, ' ');

		if (line.match(/\(.*\)$/)) { prevLine = line.replace(/\(.*\)$/, ''); }

		//console.log(chalk.gray('> ' + line));

		if (line.includes('not available')) {
			trigger('error', line);
			return;
		}

		if (line.includes('Confirm passkey')) {
			cmd('yes'); // FIXME - check with user first
			return;
		}

		let data = {};

		let match = line.match(/(Device|Controller)\s+(\w\w:\w\w:\w\w:\w\w:\w\w:\w\w)\s+(.*)/);

		if (match) {
			data.type = match[1];
			data.address = match[2];
			data.message = match[3];
			//console.log(data);
		}

		if (data.type === 'Controller') {
			let controller = controllers.find(c => c.address === data.address);
			if (!controller) {
				controller = { address: data.address };
				controllers.push(controller);
			}
			if (data.message.match('Discovering: yes')) { controller.discovering = true; }
			if (data.message.match('Discovering: no')) { controller.discovering = false; }
			if (data.message.match('Powered: yes')) { controller.powered = true; }
			if (data.message.match('Powered: no')) { controller.powered = false; }
			trigger('controllers', controllers);
			trigger('controller', controller);
		} 

		if (data.type === 'Device') {
			let device = devices.find(d => d.address === data.address);
			if (!device) {
				device = {
					id: 'b-' + createHash('md5').update(data.address).digest('hex'), // can be safely used as an element id
					address: data.address
				};
				devices.push(device);
				cmd(`info ${device.address}`);
			}
			if (data.message.match('Trusted: yes')) { device.trusted = true; }
			if (data.message.match('Trusted: no')) { device.trusted = false; }
			if (data.message.match('Connected: yes')) { device.connected = true; }
			if (data.message.match('Connected: no')) { device.connected = false; }
			if (data.message.match('Paired: yes')) { device.paired = true; }
			if (data.message.match('Paired: no')) { device.paired = false; }
			let icon = data.message.match('Icon: (.*)');
			if (icon) { device.icon = icon[1]; }
			let signal = data.message.match('RSSI: (-?\d+)');
			if (signal) { device.signal = Number(signal[1]); }
			let name = data.message.match(/^Name: ?([^:]*)$/);
			if (name) { device.name = name[1]; }
			trigger('devices', devices);
			trigger('device', device);
		}

		if (line.includes('Device has been removed')) {
			trigger('device-removed');
		}
	});
});


cmd('agent on');
cmd('default-agent');
cmd('show'); // get controller info
cmd('devices'); // get currently known bluetooth devices

//scan();

/*
const fs = require('fs');
let lastData;
setInterval(() => {
	let data = [
		'Controllers',
		JSON.stringify(controllers, null, 2),
		'Devices',
		JSON.stringify(devices, null, 2),
	].join('\n\n');

	if (data !== lastData) {
		lastData = data;
		fs.writeFileSync('bt', data, 'utf8');
	}
}, 500);*/


module.exports = { power, scan, devices, controllers, pair, unpair, on, off };
