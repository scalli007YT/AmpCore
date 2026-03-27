export {};

declare global {
  interface Window {
    electronWindow?: {
      isDesktop: boolean;
      getVersion: () => Promise<string>;
      getPlatform: () => Promise<"darwin" | "win32" | "linux" | string>;
      minimize: () => Promise<boolean>;
      toggleMaximize: () => Promise<boolean>;
      close: () => Promise<boolean>;
      isMaximized: () => Promise<boolean>;
      onMaximizedChange: (callback: (maximized: boolean) => void) => () => void;
    };
  }
}
