const {
	contextBridge,
	ipcRenderer
} = require("electron");
	
contextBridge.exposeInMainWorld(
	"api", {
		getConfig: () => {
			return ipcRenderer.invoke('get-config');
		},
		playNotificationSound: (sound) => {
			ipcRenderer.invoke('play-notification-sound', sound);
		},
		showNotification: (options) => {
			ipcRenderer.invoke('show-notification', options);
		},
		getSystemIdleState: () => {
			ipcRenderer.invoke('get-system-idle-state');
		},
		incommingCallCreated: (data) => {
			ipcRenderer.invoke('incoming-call-created', data);
		},
		incommingCallConnecting: () => {
			ipcRenderer.invoke('incoming-call-connecting');
		},
		incommingCallDisconnecting: () => {
			ipcRenderer.invoke('incoming-call-disconnecting');
		},
		callConnected: () => {
			ipcRenderer.invoke('call-connected');
		},
		callDisconnected: () => {
			ipcRenderer.invoke('call-disconnected');
		},
		userStatusChanged: (data) => {
			ipcRenderer.invoke('user-status-changed', data);
		},
		getZoomLevel: (partition) => {
			ipcRenderer.invoke('get-zoom-level', partition)
		},
		saveZoomLevel: (zoomLevel, partition) => {
			ipcRenderer.invoke('save-zoom-level', zoomLevel, partition)
		},
		onEnableWakeLock: (callback) => {
			ipcRenderer.on('enable-wakelock', callback);
		},
		onDisableWakeLock: (callback) => {
			ipcRenderer.on('disable-wakelock', callback);
		},
		selectSource: () => {
			ipcRenderer.send('select-source');
		},
		onceSelectSource: (callback) => {
			ipcRenderer.once('select-source', callback);
		},
		updateTrayIcon: (icon, flash) => {
			ipcRenderer.send('tray-update', {
				icon: icon,
				flash: flash,
			});
		},
		setBadgeCount: (count) => {
			ipcRenderer.invoke('set-badge-count', count);
		},
		onSystemThemeChanged: (callback) => {
			ipcRenderer.on('system-theme-changed', callback);
		},
		onGetTeamsSettings: (callback) => {
			ipcRenderer.on('get-teams-settings', callback)
		},
		onSetTeamsSettings: (callback) => {
			ipcRenderer.on('set-teams-settings', callback)
		},
		getCustomBgList: () => {
			ipcRenderer.invoke('get-custom-bg-list');
		},
	},
);

window.onload = () => {
	console.log("getting config ...")
	window.api.getConfig().then(mainConfig => {
		alert(mainConfig);
	});
}
