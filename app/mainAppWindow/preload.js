const {
	contextBridge,
	ipcRenderer
} = require("electron");

let config = {};
let reactHandler;

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
//activityManager
//activityHub
//shortcuts
//trayIconChooser
//trayIconRenderer (if enabled)
//zoom
