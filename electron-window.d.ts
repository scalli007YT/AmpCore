export {};

declare global {
  interface Window {
    electronWindow?: {
      isDesktop: boolean;
      getVersion: () => Promise<string>;
      getPlatform: () => Promise<"darwin" | "win32" | "linux" | string>;
      openSpeakerLibraryFolder: () => Promise<{ ok: boolean; path?: string; error?: string }>;
      pickSlFolder: () => Promise<{
        ok: boolean;
        canceled?: boolean;
        error?: string;
        files?: Array<{ name: string; data: string }>;
      }>;
      minimize: () => Promise<boolean>;
      toggleMaximize: () => Promise<boolean>;
      close: () => Promise<boolean>;
      isMaximized: () => Promise<boolean>;
      onMaximizedChange: (callback: (maximized: boolean) => void) => () => void;
    };
  }
}
