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
    api?: {
      openSettingsWindow: () => Promise<void>;
      selectFolder: (options?: {
        title?: string;
        defaultPath?: string;
      }) => Promise<string | null>;
      getServerUrl: () => Promise<string | null>;
      log: (level: string, ...args: unknown[]) => Promise<void>;
      getDesktopConfig: () => Promise<{ killServerOnExit: boolean }>;
      setDesktopConfig: (config: {
        killServerOnExit: boolean;
      }) => Promise<void>;
      proxyFetch: (
        url: string,
        options: {
          method: string;
          headers: Record<string, string>;
          body?: string;
        }
      ) => Promise<{
        ok: boolean;
        status: number;
        headers: Record<string, string>;
        body: ArrayBuffer;
      }>;
      windowControls: {
        minimize: () => Promise<void>;
        maximize: () => Promise<void>;
        unmaximize: () => Promise<void>;
        close: () => Promise<void>;
        isMaximized: () => Promise<boolean>;
        onMaximizedChange: (
          callback: (isMaximized: boolean) => void
        ) => () => void;
      };
    };
  }
}

declare module '*.css';

export {};
