import type { PlotBridge } from '@shared/ipc';

declare global {
  interface Window {
    plot: PlotBridge;
  }
}
