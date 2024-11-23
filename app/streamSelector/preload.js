const {
    contextBridge,
    ipcRenderer
} = require("electron");

contextBridge.exposeInMainWorld(
    "api", {
        selectedSource: (args) => {
            return ipcRenderer.send('selected-source', args);
        },
        closeView: () => {
            return ipcRenderer.send('close-view');
        },
        desktopCapturerGetSources: (args) => {
            return ipcRenderer.invoke('desktop-capturer-get-sources', args);
        },
    }
);
