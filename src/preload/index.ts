import {
  IPC_METHODS,
  ipcChannel,
  isMenuCommand,
  MENU_COMMAND_CHANNEL,
  type MenuCommandListener,
  type ViewerBridge,
} from '@shared/ipc';
import { contextBridge, type IpcRendererEvent, ipcRenderer } from 'electron';

const methods = Object.fromEntries(
  IPC_METHODS.map((method) => [
    method,
    (...args: unknown[]) => ipcRenderer.invoke(ipcChannel(method), ...args),
  ]),
);

function onMenuCommand(listener: MenuCommandListener): () => void {
  const forward = (_event: IpcRendererEvent, command: unknown) => {
    if (isMenuCommand(command)) {
      listener(command);
    }
  };
  ipcRenderer.on(MENU_COMMAND_CHANNEL, forward);
  return () => ipcRenderer.removeListener(MENU_COMMAND_CHANNEL, forward);
}

const bridge = { platform: process.platform, onMenuCommand, ...methods } as ViewerBridge;

contextBridge.exposeInMainWorld('viewer', bridge);
