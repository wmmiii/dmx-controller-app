import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { SerialContext } from "./SerialContext";

/**
 * A handler that takes a key description, may perform an action, and returns a
 * boolean indicating if any action was taken.
 */
type ShortcutHandler = (key: string) => boolean;

export const ShortcutContext = createContext({
  setShortcutHandler: (_handler: ShortcutHandler) => { },
  clearShortcutHandler: (_handler: ShortcutHandler) => { },
});

export function ShortcutProvider({ children }: PropsWithChildren): JSX.Element {
  const serialContext = useContext(SerialContext);
  const handlers = useRef<ShortcutHandler[]>([]);

  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      for (let h of handlers.current) {
        if (h(ev.code)) {
          break;
        }
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const globalHandler: ShortcutHandler = useCallback((key: string) => {
    switch (key) {
      case 'KeyB':
        serialContext.setBlackout(!serialContext.blackout);
        return true;
      case 'KeyC':
        serialContext.connect();
        return true;
      default:
        return false;
    }
  }, [serialContext]);

  useEffect(() => {
    handlers.current[0] = globalHandler;
  }, [globalHandler]);

  const clearShortcutHandler = useCallback((handler: ShortcutHandler) => {
    handlers.current = handlers.current.filter((h) => h !== handler);
  }, []);

  const setShortcutHandler = useCallback((handler: ShortcutHandler) => {
    clearShortcutHandler(handler);
    handlers.current.push(handler);
  }, [clearShortcutHandler]);

  return (
    <ShortcutContext.Provider value={{
      setShortcutHandler: setShortcutHandler,
      clearShortcutHandler: clearShortcutHandler,
    }}>
      {children}
    </ShortcutContext.Provider>
  );
}
