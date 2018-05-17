
const moment = require('moment');

module.exports = {
	applet: `${__dirname}/clock.html`,
	init(panel) {
		const renderClock = () => {
			panel.js(`
				document.getElementById('clock').innerHTML = "${moment().format('ddd DD MMM HH:mm')}";
			`);
		};
		setInterval(renderClock, 5000);
		renderClock();
	}
};
