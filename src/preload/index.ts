import type { ViewerApi } from '@shared/api';
import { contextBridge } from 'electron';

const api: ViewerApi = {
  platform: process.platform,
};

contextBridge.exposeInMainWorld('viewer', api);
