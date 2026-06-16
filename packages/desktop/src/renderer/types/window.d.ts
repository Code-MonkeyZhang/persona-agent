import type { WindowAPI } from '@shared/types/api';

declare global {
  interface Window {
    electron?: {
      ipcRenderer: {
        invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
      };
      process: {
        platform: NodeJS.Platform;
      };
    };
    api?: WindowAPI;
  }
}

declare module '*.css';

export {};
