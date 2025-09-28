declare global {
  interface Window {
    __TAURI_INTERNALS__: Record<string, unknown>;
  }
}

declare module '*.scss' {
  let _module: { [key: string]: string };
  export = _module;
}
