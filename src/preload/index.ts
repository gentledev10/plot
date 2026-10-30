import { IPC_METHODS, ipcChannel, type ViewerBridge } from '@shared/ipc';
import { contextBridge, ipcRenderer } from 'electron';

const methods = Object.fromEntries(
  IPC_METHODS.map((method) => [
    method,
    (...args: unknown[]) => ipcRenderer.invoke(ipcChannel(method), ...args),
  ]),
);

const bridge = { platform: process.platform, ...methods } as ViewerBridge;

contextBridge.exposeInMainWorld('viewer', bridge);
