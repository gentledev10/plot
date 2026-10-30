import type { ViewerApi } from '@shared/api';

declare global {
  interface Window {
    viewer: ViewerApi;
  }
}
