'use strict';

const Bluebird = require('bluebird');
const { execFile, spawn } = require('child_process');

const exec = (cmd, args) => {
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

module.exports = { exec, parseTable };