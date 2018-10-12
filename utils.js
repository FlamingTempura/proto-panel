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

const watcha = (file, cb, poll) => {
	if (poll) {
		let prev;
		setInterval(() => {
			fs.statAsync(file)
				.then(stat => {
					console.log(stat)
					if (stat.mtimeMs !== prev) {
						prev = stat.mtimeMs;
						cb();
					}
				});
		}, poll);
		//fs.watchFile(file, { interval: poll }, cb); // stat polling
	}
	fs.watch(file, cb);
};

const watchb = (file, cb, poll) => {
	if (poll) {
		let prev;
		setInterval(() => {
			fs.readFileAsync(file, 'utf8')
				.then(contents => {
					if (contents !== prev) {
						prev = contents;
						cb();
					}
				});
		}, poll);
		//fs.watchFile(file, { interval: poll }, cb); // stat polling
	}
	fs.watch(file, cb);
};


const watch = (file, cb, poll) => {
	if (poll) {
		let prev;
		let buffer = new Buffer.alloc(1);
		fs.open(file, 'r', (status, fd) => {
			setInterval(() => {
				fs.read(fd, buffer, 0, 1, 0, () => {
					let contents = buffer.toString('utf8');
					if (contents !== prev) {
						prev = contents;
						cb();
					}
				});
			}, poll);
		});
		//fs.watchFile(file, { interval: poll }, cb); // stat polling
	}
	fs.watch(file, cb);
};

module.exports = { exec, parseTable, watch };