'use strict';

const moment = require('moment');

module.exports = {
	applet: `${__dirname}/clock.html`,
	api: {
		time() {
			return {
				listen: cb => {
					const time = () => cb(moment().format('ddd DD MMM HH:mm'));
					setInterval(time, 5000);
					time();
				}
			};
		}
	}
};
