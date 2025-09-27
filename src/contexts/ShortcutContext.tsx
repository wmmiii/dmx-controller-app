import {
  JSX,
  PropsWithChildren,
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { Modal } from '../components/Modal';

import styles from './ShortcutContext.module.scss';

type ShortcutBundle = Array<{
  shortcut: {
    key: string;
    modifiers?: ('alt' | 'ctrl' | 'shift')[];
  };
  action: () => void;
  description: string;
}>;

export const ShortcutContext = createContext({
  setShortcuts: (_shortcuts: ShortcutBundle) => () => {},
});

export function ShortcutProvider({ children }: PropsWithChildren): JSX.Element {
  const shortcutBundles = useRef<Array<ShortcutBundle>>([[]]);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      if (ev.target instanceof HTMLInputElement) {
        return;
      }

      outerLoop: for (const b of [...shortcutBundles.current].reverse()) {
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
        shortcut: { key: 'Slash', modifiers: ['ctrl'] },
        action: () => setShowHelp(!showHelp),
        description: 'Shows the Keyboard Shortcuts dialog.',
      },
    ];
    shortcutBundles.current[0] = defaultBundle;
  }, [shortcutBundles.current, showHelp]);

  return (
    <ShortcutContext.Provider
      value={{
        setShortcuts: setShortcuts,
      }}
    >
      {children}
      {showHelp && (
        <Modal title="Keyboard Shortcuts" onClose={() => setShowHelp(false)}>
          <p>These are the keyboard shortcuts available right now.</p>
          <table className={styles.shortcutTable}>
            <tbody>
              {shortcutBundles.current.map((b) =>
                b.map((s) => {
                  const shortcut = [
                    ...(s.shortcut.modifiers?.map(shortcutKeyName) || []),
                    shortcutKeyName(s.shortcut.key),
                  ];
                  return (
                    <tr key={s.description}>
                      <th>{shortcut.join(' + ')}</th>
                      <td>{s.description}</td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </Modal>
      )}
    </ShortcutContext.Provider>
  );
}

function matchesShortcut(
  event: KeyboardEvent,
  shortcut: ShortcutBundle[0]['shortcut'],
): boolean {
  const modifiers = shortcut.modifiers || [];
  return (
    shortcut.key === event.code &&
    event.altKey === modifiers.includes('alt') &&
    event.ctrlKey === modifiers.includes('ctrl') &&
    event.shiftKey === modifiers.includes('shift')
  );
}

function shortcutKeyName(keyCode: string) {
  if (keyCode.startsWith('Key')) {
    return keyCode.substring(3).toLowerCase();
  } else if (keyCode === 'Slash') {
    return '/';
  } else if (keyCode === 'Escape') {
    return 'esc';
  } else if (keyCode === 'Delete') {
    return 'del';
  } else if (keyCode === 'Space') {
    return 'space';
  } else if (keyCode === 'PageUp') {
    return 'page up';
  } else if (keyCode === 'PageDown') {
    return 'page down';
  } else if (keyCode === 'Home') {
    return 'home';
  } else if (keyCode === 'End') {
    return 'end';
  }
  return keyCode;
}
