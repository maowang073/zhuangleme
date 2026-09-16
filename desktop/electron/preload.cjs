const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("zhuangleme", {
  getPlatform: () => ipcRenderer.invoke("system:platform"),
  startInstall: (payload) => ipcRenderer.invoke("install:start", payload),
  stopInstall: (id) => ipcRenderer.invoke("install:stop", id),
  onInstallEvent: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("install:event", handler);
    return () => ipcRenderer.removeListener("install:event", handler);
  },
});

