const activityHub = require('../tools/activityHub');
const wakeLock = require('../tools/wakeLock');

class ActivityManager {
	constructor(config) {
		this.config = config;
		this.myStatus = -1;
	}

	start() {
		setActivityHandlers(this);
		setEventHandlers();
		activityHub.start();
		activityHub.setDefaultTitle(this.config.appTitle);
		this.watchSystemIdleState();
	}

	watchSystemIdleState() {
		const self = this;
		window.api.getSystemIdleState().then((state) => {
			let timeOut;
			if (this.config.awayOnSystemIdle) {
				timeOut = this.setStatusAwayWhenScreenLocked(state);
			} else {
				timeOut = this.keepStatusAvailableWhenScreenLocked(state);
			}
			setTimeout(() => self.watchSystemIdleState(), timeOut);
		});
	}
    
	setStatusAwayWhenScreenLocked(state) {
		activityHub.setMachineState(state.system === 'active' ? 1 : 2);
		const timeOut = (state.system === 'active' ? this.config.appIdleTimeoutCheckInterval : this.config.appActiveCheckInterval) * 1000;

		if (state.system === 'active' && state.userIdle === 1) {
			activityHub.setUserStatus(1);
		} else if (state.system !== 'active' && state.userCurrent === 1) {
			activityHub.setUserStatus(3);
		}
		return timeOut;
	}

	keepStatusAvailableWhenScreenLocked(state) {
		if ((state.system === 'active') || (state.system === 'locked')) {
			activityHub.setMachineState(1);
			return this.config.appIdleTimeoutCheckInterval * 1000;
		}
		activityHub.setMachineState(2);
		return this.config.appActiveCheckInterval * 1000;
	}
}

function setActivityHandlers(self) {
	activityHub.on('activities-count-updated', updateActivityCountHandler());
	activityHub.on('incoming-call-created', incomingCallCreatedHandler());
	activityHub.on('incoming-call-connecting', incomingCallConnectingHandler());
	activityHub.on('incoming-call-disconnecting', incomingCallDisconnectingHandler());
	activityHub.on('call-connected', callConnectedHandler());
	activityHub.on('call-disconnected', callDisconnectedHandler());
	activityHub.on('meeting-started', meetingStartNotifyHandler(self));
	activityHub.on('my-status-changed', myStatusChangedHandler());
}

function setEventHandlers() {
	window.api.onEnableWakeLock(() => wakeLock.enable());
	window.api.onDisableWakeLock(() => wakeLock.disable());
}

function updateActivityCountHandler() {
	return async (data) => {
		const event = new CustomEvent('unread-count', { detail: { number: data.count } });
		window.dispatchEvent(event);
	};
}

function incomingCallCreatedHandler() {
	return async (data) => {
		window.api.incomingCallCreated(data);
	};
}

function incomingCallConnectingHandler() {
	return async () => {
		window.api.incomingCallConnecting();
	};
}

function incomingCallDisconnectingHandler() {
	return async () => {
		window.api.incomingCallDisconnecting();
	};
}

function callConnectedHandler() {
	return async () => {
		window.api.callConnected();
	};
}

function callDisconnectedHandler() {
	return async () => {
		window.api.callDisconnected();
	};
}

// eslint-disable-next-line no-unused-vars
function meetingStartNotifyHandler(self) {
	if (!self.config.disableMeetingNotifications) {
		return async (meeting) => {
			new window.Notification('Meeting has started', {
				type: 'meeting-started', body: meeting.title
			});
		};
	}
	return null;
}

function myStatusChangedHandler() {
	return async (event) => {
		window.api.userStatusChanged(event.data);
	};
}

module.exports = exports = ActivityManager;
