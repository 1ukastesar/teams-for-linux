const ReactHandler = require('./reactHandler');

class Settings {
	init() {
		window.api.onGetTeamsSettings(retrieve);
		window.api.onSetTeamsSettings(restore);
	}
}

async function retrieve(event) {
	const clientPreferences = ReactHandler.getTeams2ClientPreferences();

	if (clientPreferences) {
		const settings = {
			theme: clientPreferences.theme.userTheme,
			chatDensity: clientPreferences.density.chatDensity,
		};
		event.sender.send('get-teams-settings', settings);
	}
}

async function restore(event, ...args) {
	const clientPreferences = ReactHandler.getTeams2ClientPreferences();

	if (clientPreferences) {
		clientPreferences.theme.userTheme = args[0].theme;
		clientPreferences.density.chatDensity = args[0].chatDensity;
		event.sender.send('set-teams-settings', true);
	}
}

module.exports = new Settings();