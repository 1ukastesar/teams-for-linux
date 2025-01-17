const {
	contextBridge,
	ipcRenderer,
	webFrame,
} = require("electron");


let config = {};

contextBridge.exposeInMainWorld(
	"api", {
		getConfig: () => {
			return ipcRenderer.invoke('get-config');
		},
		selectSource: () => {
			ipcRenderer.send('select-source');
		},
		onceSelectSource: (callback) => {
			ipcRenderer.once('select-source', callback);
		},
		onSystemThemeChanged: (callback) => {
			ipcRenderer.on('system-theme-changed', callback);
		},
	},
);

window.addEventListener('DOMContentLoaded', () => {
	console.debug("getting teams for linux config...")
	ipcRenderer.invoke('get-config').then(mainConfig => {
		config = mainConfig || {};
		console.debug('got teams for linux config', config);
		applyMutationTitleLogic();
		emulatePlatform();
		disableAutogain();
		setEventHandlers();
		setupChromeAPI();
		initialiseZoom();
		setupShortcutKeys();
		trayIconConfiguration();
		startActivityManager();
		// getTeams2ClientPreferences().theme.followOsTheme = config.followSystemTheme; // TODO: WAIT UNTIL LOADED
		// console.log(getTeams2ClientPreferences());
	}).catch(error => {
		console.error("Error getting config:", error);
	});

	Object.defineProperty(navigator.serviceWorker, 'register', {
		value: () => {
			return Promise.reject();
		}
	});
})

//mutationlogic
function applyMutationTitleLogic() {
	if (!config.useMutationTitleLogic) {
		console.debug('MutationTitleLogic is disabled');
		return;
	}

	console.debug('Appliying MutationObserverTitle logic');
	const observer=new window.MutationObserver(
		() => {
			console.debug(`title changed to ${window.document.title}`);
			const regex=/^\((\d+)\)/;
			const match=regex.exec(window.document.title);
			const number=match? match[1]:0;
			const event=new CustomEvent('unread-count',{detail: {number: number}});
			window.dispatchEvent(event);
		}
	);
	observer.observe(window.document.querySelector('title'),{childList: true});
	console.debug('MutationObserverTitle logic applied');
}


//emulatePlatform
function emulatePlatform() {
	if (!config.emulateWinChromiumPlatform) {
		return
	}

	// update property platform property in navigator.navigator
	const win32Str = "Win32"
	const windowsStr = "Windows"
	Object.defineProperty(Navigator.prototype, "platform", { get: () => { return win32Str } })

	//update userAgentData object
	let originalUserAgentData = navigator.userAgentData
	let customUserAgentData = JSON.parse(JSON.stringify(originalUserAgentData))
	customUserAgentData = {
		...customUserAgentData,
		platform: windowsStr,
		getHighEntropyValues: async function (input) {
			let highEntropyValue = await originalUserAgentData.getHighEntropyValues(input)
			if (highEntropyValue['platform']) {
				highEntropyValue['platform'] = windowsStr
			}
			return highEntropyValue
		}
	}
	Object.defineProperty(Navigator.prototype, "userAgentData", { get: () => { return customUserAgentData } })
}


//disableAutogain
function disableAutogain() {
	if (!config.disableAutogain) {
		return
	}
	console.debug('Disabling autogain');

	patchFunction(navigator, 'getUserMedia', patchDeprecatedGetUserMedia);
	patchFunction(navigator, 'mozGetUserMedia', patchDeprecatedGetUserMedia);
	patchFunction(navigator, 'webkitGetUserMedia', patchDeprecatedGetUserMedia);
	patchFunction(MediaStreamTrack.prototype, 'applyConstraints', (original) => {
		return function applyConstraints(constraints) {
			disableAutogain(constraints);
			return original.call(this, constraints);
		};
	});

	patchFunction(navigator.mediaDevices, 'getUserMedia', (original) => {
		return function getUserMedia(constraints) {
			console.debug('getUserMedia called with constraints', constraints);
			disableAutogain(constraints);
			return original.call(this, constraints);
		};
	});

	function patchFunction(object, name, createNewFunction) {
		if (name in object) {
			object[name] = createNewFunction(object[name]);
		}
	}

	function patchDeprecatedGetUserMedia(original) {
		return function getUserMedia(constraints, success, error) {
			console.debug('deprecated getUserMedia called with constraints', constraints);
			this.disableAutogain(constraints);
			return original.call(this, constraints, success, error);
		};
	}

	function setLegacyChromeConstraint(constraint, name, value) {
		if (constraint.mandatory && name in constraint.mandatory) {
			constraint.mandatory[name] = value;
			return;
		}
		if (constraint.optional) {
			const element = constraint.optional.find(opt => name in opt);
			if (element) {
				element[name] = value;
				return;
			}
		} else {
			constraint.optional = [];
			constraint.optional.push({ [name]: value });
		}
	}

	function setConstraint(constraint, name, value) {
		if (constraint.advanced) {
			const element = constraint.advanced.find(opt => name in opt);
			if (element) {
				element[name] = value;
				return;
			}
		}
		constraint[name] = value;
	}
	
	function disableAutogain(constraints) {
		console.info('Automatically unsetting gain!', constraints);
		if (constraints?.audio) {
			if (typeof constraints.audio !== 'object') {
				constraints.audio = {};
			}
			if (constraints.audio.optional || constraints.audio.mandatory) {
				setLegacyChromeConstraint(constraints.audio, 'googAutoGainControl', false);
				setLegacyChromeConstraint(constraints.audio, 'googAutoGainControl2', false);
			} else {
				setConstraint(constraints.audio, 'autoGainControl', false);
			}
		}
	}
};

//wakeLock
let lock = null;

async function enableWakeLock() {
	try {
		const screenLock = await navigator.wakeLock.request('screen');
		screenLock.addEventListener('release', () => {
			console.debug('Wake Lock was released');
		});
		console.debug('Wake Lock is active');
		lock = screenLock;
	} catch (err) {
		console.error(`wakelog enable error ${err.name}, ${err.message}`);
	}
}

async function disableWakeLock() {
	if (!lock) {
		console.debug('Wake Lock is already disabled');
		return;
	}
	try {
		await lock.release();
		console.debug('Wake Lock is disabled');
		lock = null;
	} catch (err) {
		console.error(`wakelog disable error ${err.name}, ${err.message}`);
	}
}

function setEventHandlers() {
	ipcRenderer.on('enable-wakelock', enableWakeLock);
	ipcRenderer.on('disable-wakelock', disableWakeLock);
	ipcRenderer.on('get-teams-settings', getTeamSettings);
	ipcRenderer.on('set-teams-settings', setTeamSettings);
	ipcRenderer.on('system-theme-changed', _applyUserTheme);
}


//chromeAPI -> this needs to be execute javascript
let _getDisplayMedia;

function setupChromeAPI() {
	if (process.env.XDG_SESSION_TYPE === 'wayland') {
		_getDisplayMedia = MediaDevices.prototype.getDisplayMedia;
		MediaDevices.prototype.getDisplayMedia = customGetDisplayMediaWayland;
	} else {
		MediaDevices.prototype.getDisplayMedia = customGetDisplayMediaX11;
	}
}

async function customGetDisplayMediaWayland(...args) {
	args[0].audio = false;
	args[0].systemAudio = 'exclude';

	return await _getDisplayMedia.apply(navigator.mediaDevices, args);
}

function customGetDisplayMediaX11() {
	return new Promise((resolve, reject) => {
		console.info('Requesting screen sharing');
		// Request main process to allow access to screen sharing
		window.api.onceSelectSource((_event, source) => {
			console.info('onceSelectSource', source);
			startStreaming({ source, resolve, reject });
		});
		window.api.selectSource();
	});
}

function startStreaming(properties) {
	console.info('Starting streaming', properties);
	if (properties.source) {
		navigator.mediaDevices.getUserMedia({
			audio: false,
			video: {
				mandatory: {
					chromeMediaSource: 'desktop',
					chromeMediaSourceId: properties.source.id,
					minWidth: properties.source.screen.width,
					maxWidth: properties.source.screen.width,
					minHeight: properties.source.screen.height,
					maxHeight: properties.source.screen.height
				}
			}
		}).then(stream => {
			properties.resolve(stream);
		}).catch(e => {
			console.error(e.message);
			properties.reject(e.message);
		});
	} else {
		properties.reject('Access denied');
	}
}

//settings
async function getTeamSettings(event) {
	console.debug('Getting teams settings');
	const clientPreferences = getTeams2ClientPreferences();

	const settings = {
		theme: clientPreferences.theme.userTheme,
		chatDensity: clientPreferences.density.chatDensity,
	};
	event.sender.send('get-teams-settings', settings);
}

async function setTeamSettings(event, ...args) {
	console.debug('Setting teams settings');
	const clientPreferences = getTeams2ClientPreferences();
	clientPreferences.theme.userTheme = args[0].theme;
	clientPreferences.density.chatDensity = args[0].chatDensity;
	event.sender.send('set-teams-settings', true);
}

//reactHandler are helper functions to get data from the react app MS manages
function _applyUserTheme(_event, ...args) {//make this execute javascript???
	const theme = args[0] ? 'dark' : 'default';
	getTeams2ClientPreferences().theme.userTheme = theme;
	console.debug('Theme changed to', theme);
}

function _getTeams2CoreServices() { //make this execute javascript???
	const reactElement = document.getElementById('app');
	const internalRoot = reactElement?._reactRootContainer?._internalRoot || reactElement?._reactRootContainer;
	return internalRoot?.current?.updateQueue?.baseState?.element?.props?.coreServices;
}

function getTeams2IdleTracker() {
	const teams2CoreServices = _getTeams2CoreServices();
	return teams2CoreServices?.clientState?._idleTracker;
}

function getTeams2ClientPreferences() {
	const teams2CoreServices = _getTeams2CoreServices();
	return teams2CoreServices?.clientPreferences?.clientPreferences;
}
//document.getElementById('app')._reactRootContainer.current.updateQueue.baseState.element.props.coreServices

//TODO: Add the following to the file and contextBridge:

////activityHub
const eventHandlers = [];

// Supported events
const supportedEvents = [
	'incoming-call-created',
	'incoming-call-connecting',
	'incoming-call-disconnecting',
	'call-connected',
	'call-disconnected',
	'activities-count-updated',
	'meeting-started',
	'my-status-changed'
];

function setMachineState(state) {
	const teams2IdleTracker = getTeams2IdleTracker();
	if (teams2IdleTracker) {
		try {
			console.debug(`setMachineState teams2 state=${state}`);
			if (state === 1) {
				teams2IdleTracker.handleMonitoredWindowEvent();
			} else {
				teams2IdleTracker.transitionToIdle();
			}
		} catch (e) {
			console.error('Failed to set teams2 Machine State', e);
		}
	}
}

function setUserStatus(status) {
	const teams2IdleTracker = getTeams2IdleTracker();
	if (teams2IdleTracker) {
		try {
			console.debug(`setUserStatus teams2 status=${status}`);
			if (status === 1) {
				teams2IdleTracker.handleMonitoredWindowEvent();
			} else {
				teams2IdleTracker.transitionToIdle();
			}
		} catch (e) {
			console.error('Failed to set teams2 User Status', e);
		}
	}
}

function refreshAppState(controller, state) {
	const self = controller.appStateService;
	controller.appStateService.refreshAppState.apply(self, [() => {
		self.inactiveStartTime = null;
		self.setMachineState(state);
		self.setActive(state == 1 && (self.current == 4 || self.current == 5) ? 3 : self.current);
	}, '', null, null]);
}

function isSupportedEvent(event) {
	return supportedEvents.some(e => {
		return e === event;
	});
}

function isFunction(func) {
	return typeof (func) === 'function';
}

function addEventHandler(event, handler) {
	let handle;
	if (isSupportedEvent(event) && isFunction(handler)) {
		handle = Math.ceil(Math.random() * 100000);
		eventHandlers.push({
			event: event,
			handle: handle,
			handler: handler
		});
	}
	return handle;
}

////activityManager

function startActivityManager() {
	addEventHandler('activities-count-updated', updateActivityCountHandler());
	addEventHandler('incoming-call-created', incomingCallCreatedHandler());
	addEventHandler('incoming-call-connecting', incomingCallConnectingHandler());
	addEventHandler('incoming-call-disconnecting', incomingCallDisconnectingHandler());
	addEventHandler('call-connected', callConnectedHandler());
	addEventHandler('call-disconnected', callDisconnectedHandler());
	addEventHandler('meeting-started', meetingStartNotifyHandler(self));
	addEventHandler('my-status-changed', myStatusChangedHandler());
	watchSystemIdleState();
}

function watchSystemIdleState() {
	window.api.getSystemIdleState().then((state) => {
		let timeOut;
		if (config.awayOnSystemIdle) {
			timeOut = setStatusAwayWhenScreenLocked(state);
		} else {
			timeOut = keepStatusAvailableWhenScreenLocked(state);
		}
		setTimeout(() => watchSystemIdleState(), timeOut);
	});
}
    
function setStatusAwayWhenScreenLocked(state) {
	setMachineState(state.system === 'active' ? 1 : 2);
	const timeOut = (state.system === 'active' ? config.appIdleTimeoutCheckInterval : config.appActiveCheckInterval) * 1000;

	if (state.system === 'active' && state.userIdle === 1) {
		setUserStatus(1);
	} else if (state.system !== 'active' && state.userCurrent === 1) {
		setUserStatus(3);
	}
	return timeOut;
}

function keepStatusAvailableWhenScreenLocked(state) {
	if ((state.system === 'active') || (state.system === 'locked')) {
		setMachineState(1);
		return config.appIdleTimeoutCheckInterval * 1000;
	}
	setMachineState(2);
	return config.appActiveCheckInterval * 1000;
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


////shortcuts
const os = require('os');
const isMac = os.platform() === 'darwin';

function setupShortcutKeys() {
	whenWindowReady(addEventListeners);
}

function whenWindowReady(callback) {
	if (window) {
		callback();
	} else {
		setTimeout(() => whenWindowReady(callback), 1000);
	}
}

function addEventListeners() {
	window.addEventListener('keydown', keyDownEventHandler, false);
	window.addEventListener('wheel', wheelEventHandler, {passive: false});
	whenIframeReady((iframe) => {
		iframe.contentDocument.addEventListener('keydown', keyDownEventHandler, false);
		iframe.contentDocument.addEventListener('wheel', wheelEventHandler, {passive: false});
	});
}

function whenIframeReady(callback) {
	const iframe = window.document.getElementsByTagName('iframe')[0];
	if (iframe) {
		callback(iframe);
	} else {
		setTimeout(() => whenIframeReady(callback), 1000);
	}
}

const KEY_MAPS = {
	'CTRL_+': () => increaseZoomLevel(),
	'CTRL_=': () => increaseZoomLevel(),
	'CTRL_-': () => decreaseZoomLevel(),
	'CTRL__': () => decreaseZoomLevel(),
	'CTRL_0': () => resetZoomLevel(),
	// Alt (Option) Left / Right is used to jump words in Mac, so diabling the history navigation for Mac here
	...(!isMac ? 
		{ 
			'ALT_ArrowLeft': () => window.history.back(),
			'ALT_ArrowRight': () => window.history.forward()
		} 
		: {}
		)
};

function keyDownEventHandler(event) {
	const keyName = event.key;
	if (keyName === 'Control' || keyName === 'Alt') {
		return;
	}

	fireEvent(event, keyName);
}

function wheelEventHandler(event) {
	if (event.ctrlKey) {
		event.preventDefault();
		if (event.deltaY > 0) {
			decreaseZoomLevel();
		} else if (event.deltaY < 0) {
			increaseZoomLevel();
		}
	}
}

function getKeyName(event, keyName) {
	return `${event.ctrlKey ? 'CTRL_' : ''}${event.altKey ? 'ALT_' : ''}${keyName}`;
}

function fireEvent(event, keyName) {
	const handler = KEY_MAPS[getKeyName(event, keyName)];
	if (typeof (handler) === 'function') {
		event.preventDefault();
		handler();
	}
}


//trayIconRenderer (if enabled)
const { nativeImage } = require('electron');
const path = require('path');
const iconFolder = path.join(__dirname, '../..', 'assets/icons');

const icons = {
	icon_default_16: 'icon-16x16.png',
	icon_default_96: 'icon-96x96.png',
	icon_dark_16: 'icon-monochrome-dark-16x16.png',
	icon_dark_96: 'icon-monochrome-dark-96x96.png',
	icon_light_16: 'icon-monochrome-light-16x16.png',
	icon_light_96: 'icon-monochrome-light-96x96.png'
};

let baseIcon;
let iconSize;

function trayIconConfiguration() {
	if (!config.trayIconEnabled) {
		return;
	}
	baseIcon = nativeImage.createFromPath(getIconFile());
	iconSize = baseIcon.getSize();
	window.addEventListener('unread-count', updateActivityCount.bind(this));
}

function getIconFile() {
	if (config.appIcon.trim() !== '') {
		return config.appIcon;
	}
	return path.join(iconFolder, icons[`icon_${config.appIconType}_${isMac ? 16 : 96}`]);
}

function updateActivityCount(event) {
	const count = event.detail.number;
	renderTrayIcon(count).then(icon => {
		console.debug('sending tray-update');
		const flash = count > 0 && !config.disableNotificationWindowFlash;
		window.api.updateTrayIcon(
			icon,
			flash
		);
	});
	window.api.setBadgeCount(count);
}

function renderTrayIcon(newActivityCount) {
	return new Promise(resolve => {
		const canvas = document.createElement('canvas');
		canvas.height = 140;
		canvas.width = 140;
		const image = new Image();
		image.src = baseIcon.toDataURL('image/png');
		image.onload = () => _addRedCircleNotification(canvas, image, newActivityCount, resolve);
	});
}

function _addRedCircleNotification(canvas, image, newActivityCount, resolve) {
	const ctx = canvas.getContext('2d');

	ctx.drawImage(image, 0, 0, 140, 140);
	if (newActivityCount > 0) {
		ctx.fillStyle = 'red';
		ctx.beginPath();
		ctx.ellipse(100, 90, 40, 40, 40, 0, 2 * Math.PI);
		ctx.fill();
		ctx.textAlign = 'center';
		ctx.fillStyle = 'white';

		ctx.font = 'bold 70px "Segoe UI","Helvetica Neue",Helvetica,Arial,sans-serif';
		if (newActivityCount > 9) {
			ctx.fillText('+', 100, 110);
		} else {
			ctx.fillText(newActivityCount.toString(), 100, 110);
		}
	}
	const resizedCanvas = _getResizeCanvasWithOriginalIconSize(canvas);
	resolve(resizedCanvas.toDataURL());
}

function _getResizeCanvasWithOriginalIconSize (canvas) {
	const resizedCanvas = document.createElement('canvas'),
		rctx = resizedCanvas.getContext('2d');

	resizedCanvas.width = iconSize.width;
	resizedCanvas.height = iconSize.height;

	const scaleFactorX = iconSize.width / canvas.width,
		scaleFactorY = iconSize.height / canvas.height;
	rctx.scale(scaleFactorX, scaleFactorY);
	rctx.drawImage(canvas, 0, 0);

	return resizedCanvas;
}

////zoom
const zoomFactor = 0.25; //zoomFactor can be configurable
const zoomMin = -7.5; //-7.5 * 20% = -150% or 50% of original
const zoomMax = 7.5; // 7.5 * 20% = +200% or 300% of original
const zoomOffsets = {
	'+': 1,
	'-': -1,
	'0': 0
};

function initialiseZoom() {
	window.api.getZoomLevel(config.partition).then(zoomLevel => {
		webFrame.setZoomLevel(zoomLevel);
	});
}

function resetZoomLevel() {
	setNextZoomLevel('0', config);
}

function increaseZoomLevel() {
	setNextZoomLevel('+', config);
}

function decreaseZoomLevel() {
	setNextZoomLevel('-', config);
}

function setNextZoomLevel(keyName, config) {
	const zoomOffset = zoomOffsets[keyName];
	let zoomLevel = webFrame.getZoomLevel();
	console.debug(`Current zoom level: ${zoomLevel}`);
	if (typeof (zoomOffset) !== 'number') {
		return;
	}

	zoomLevel = zoomOffset === 0 ? 0 : zoomLevel + zoomOffset * zoomFactor;
	if (zoomLevel < zoomMin || zoomLevel > zoomMax) return;
	webFrame.setZoomLevel(zoomLevel);
	window.api.saveZoomLevel({
		partition: config.partition,
		zoomLevel: webFrame.getZoomLevel()
	});
}