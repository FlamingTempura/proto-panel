'use strict';

const Bluebird = require('bluebird');
const { execFile } = require('child_process');
const fs = require('fs');

const exec = (cmd, args = []) => {
	console.log('calling', cmd, ...args)
	return new Bluebird((resolve, reject) => {
		execFile(cmd, args, (err, stdout, stderr) => {
			if (err || stderr) { return reject(err || stderr); }
			resolve(stdout);
		});
	});
};

const parseTable = data => {
	let lines = data.split('\n'),
		headers = lines[0].split(/\s{2,}/).filter(s => s.length > 0),
		indexes = headers.map(h => lines[0].indexOf(h));
	return lines.slice(1, -1).map(line => {
		let row = {};
		headers.forEach((h, i) => {
			row[h.trim()] = line.slice(indexes[i], indexes[i + 1]).trim();
		});
		return row;
	});
};

const watch = (file, cb) => {
	setInterval(cb, 10000);
	fs.watch(file, cb);
};

module.exports = { exec, parseTable, watch };