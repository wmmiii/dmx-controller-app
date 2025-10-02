declare global {
  interface Window {
    __TAURI__: Record<string, unknown>;
  }
}

declare module '*.scss' {
  let _module: { [key: string]: string };
  export = _module;
}
