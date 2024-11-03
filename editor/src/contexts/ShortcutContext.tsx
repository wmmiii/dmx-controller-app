import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { SerialContext } from "./SerialContext";
import { Modal } from "../components/Modal";

type ShortcutBundle = Array<{
  shortcut: {
    key: string;
    modifiers?: ('alt' | 'ctrl' | 'shift')[];
  },
  action: () => void;
  description: string;
}>;

export const ShortcutContext = createContext({
  setShortcuts: (_shortcuts: ShortcutBundle) => (() => { }),
});

export function ShortcutProvider({ children }: PropsWithChildren): JSX.Element {
  const serialContext = useContext(SerialContext);
  const shortcutBundles = useRef<Array<ShortcutBundle>>([[]]);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      if (ev.target instanceof HTMLInputElement) {
        return;
      }

      outerLoop:
      for (const b of [...shortcutBundles.current].reverse()) {
        if (b) {
          for (const s of b) {
            if (matchesShortcut(ev, s.shortcut)) {
              s.action();
              ev.stopPropagation();
              ev.preventDefault();
              break outerLoop;
            }
          }
        }
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const setShortcuts = useCallback((shortcuts: ShortcutBundle) => {
    shortcutBundles.current.push(shortcuts);
    return () => {
      const index = shortcutBundles.current.indexOf(shortcuts);
      if (index >= 0) {
        shortcutBundles.current.splice(index, 1);
      }
    };
  }, []);

  useEffect(() => {
    const defaultBundle: ShortcutBundle = [
      {
        shortcut: { key: 'KeyB' },
        action: () => serialContext.setBlackout(!serialContext.blackout),
        description: 'Toggle output blackout.'
      },
      {
        shortcut: { key: 'KeyC' },
        action: () => serialContext.connect(),
        description: 'Connect to serial output.'
      },
      {
        shortcut: { key: 'Slash', modifiers: ['ctrl'] },
        action: () => setShowHelp(!showHelp),
        description: 'Shows the Keyboard Shortcuts dialog.'
      },
    ];
    shortcutBundles.current[0] = defaultBundle;
  }, [shortcutBundles.current, serialContext.blackout, showHelp]);

  return (
    <ShortcutContext.Provider value={{
      setShortcuts: setShortcuts,
    }}>
      {children}
      {
        showHelp &&
        <Modal
          title="Keyboard Shortcuts"
          onClose={() => setShowHelp(false)}>
          <p>
            These are the keyboard shortcuts available right now.
          </p>
          {
            shortcutBundles.current.map(b => b.map(s => {
              const shortcut = [
                ...(s.shortcut.modifiers || []),
                s.shortcut.key];
              return (
                <p key={s.description}>
                  <strong>
                    {shortcut.join(' + ')}
                  </strong>:&nbsp;
                  {s.description}
                </p>
              );
            }))
          }
        </Modal>
      }
    </ShortcutContext.Provider>
  );
}

function matchesShortcut(
  event: KeyboardEvent,
  shortcut: ShortcutBundle[0]['shortcut']): boolean {
  const modifiers = shortcut.modifiers || [];
  return shortcut.key === event.code &&
    event.altKey === modifiers.includes('alt') &&
    event.ctrlKey === modifiers.includes('ctrl') &&
    event.shiftKey === modifiers.includes('shift');
}
