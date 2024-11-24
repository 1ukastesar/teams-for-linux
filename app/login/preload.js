const {
    contextBridge,
    ipcRenderer
} = require("electron");

contextBridge.exposeInMainWorld(
    "login", {
        submitForm: (args) => {
            ipcRenderer.send('submitForm', args);
        },
    },
);
