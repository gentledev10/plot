import type { ViewerBridge } from '@shared/ipc';

declare global {
  interface Window {
    viewer: ViewerBridge;
  }
}
