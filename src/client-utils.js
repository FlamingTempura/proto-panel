'use strict';

const {ipcRenderer} = require('electron');

const log = (...msg) => ipcRenderer.send('log', msg);

const getAPI = (namespace) => {
	return new Promise(resolve => {
		let id = Math.round(Math.random() * 1000000000);
		ipcRenderer.send('getAPI', id, namespace);
		ipcRenderer.on(`getAPI#${id}`, (e, functions) => {
			let api = {};
			functions.forEach(f => {
				api[f] = (...args) => {
					let listenCB, resolved;
					let p = new Promise(resolve => {
						log('call', `${namespace}.${f}()`);
						let id = Math.round(Math.random() * 1000000000);
						ipcRenderer.send(`${namespace}.${f}`, id, ...args);
						let handler = (e, data) => {
							log('received', `${namespace}.${f}#${id}`);
							if (!resolved) {
								if (!listenCB) {
									ipcRenderer.removeListener(`${namespace}.${f}.${id}`, handler);
								}
								resolved = true;
								resolve(data);
							}
							if (listenCB) {
								listenCB(data);
							}
						};
						ipcRenderer.on(`${namespace}.${f}#${id}`, handler);
					});
					p.listen = cb => {
						listenCB = cb;
						return () => {
							console.log('stop listening');
							ipcRenderer.send(`${namespace}.${f}.stop`, id);
							// stop listening
						};
					};
					return p;
				};
			});
			let listeners = {};
			api.on = (event, cb) => {
				if (!listeners[event]) {
					listeners[event] = [];
					api[event + 'Listener']().listen((...args) => {
						listeners[event].forEach(cb => cb(...args));
					});
				}
				listeners[event].push(cb);
			};
			api.off = (event, cb) => {
				let i = listeners[event].indexOf(cb);
				if (i > -1) {
					listeners[event].splice(i, 1);
				}
			};
			resolve(api);
		});
	});
};

const $ = (query, root = document) => root.querySelector(query);

const $$ = (query, root = document) => root.querySelectorAll(query);

const createSlider = ($slider, min = 0, max = 100) => {

	let $handle = $('.handle', $slider),
		$barActive = $('.bar-active', $slider),
		sliderWidth = $slider.offsetWidth - $handle.offsetWidth + 2,
		handleOffset = $handle.offsetWidth / 2 - 2,
		offset = -$slider.offsetLeft - handleOffset,
		mousedown, currVal;
	log(offset);

	$slider.addEventListener('mousedown', () => mousedown = true);
	window.addEventListener('mouseup', () => mousedown = false);
	window.addEventListener('mousemove', e => {
		if (!mousedown) { return; }
		let x = Math.min(sliderWidth, Math.max(0, e.pageX + offset));
		
		$handle.style.transform = `translateX(${x}px)`;
		$barActive.style.width = x + 'px';
		
		currVal = min + x / sliderWidth * (max - min);
		$slider.dispatchEvent(new CustomEvent('change'));
	});
	$slider.setValue = (value) => {
		if (mousedown) { return; }
		let x = (value - min) / (max - min) * sliderWidth;
		$handle.style.transform = `translateX(${x}px)`;
		$barActive.style.width = x + 'px';
	};
	$slider.getValue = () => currVal;
};

const browser = {
	on(event, cb) {
		ipcRenderer.send('on', event);
		ipcRenderer.on(`on:${event}`, cb);
	}
};

module.exports = { log, getAPI, $, $$, createSlider, browser };