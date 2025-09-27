import {
  JSX,
  PropsWithChildren,
  createContext,
  useCallback,
  useState,
} from 'react';

const DIALOG_DISMISSED_KEY = 'dialogs-dismissed';

export const DialogContext = createContext({
  isDismissed: (dialogName: string) => loadDismissed()[dialogName],
  setDismissed: (_dialogName: string) => {},
});

export function DialogProvider({ children }: PropsWithChildren): JSX.Element {
  const [dismissed, setDismissed] = useState<{ [dialogName: string]: boolean }>(
    loadDismissed(),
  );

  const setDismissedImpl = useCallback(
    (dialogName: string) => {
      dismissed[dialogName] = true;
      localStorage.setItem(DIALOG_DISMISSED_KEY, JSON.stringify(dismissed));
      setDismissed(Object.assign({}, dismissed));
    },
    [dismissed, setDismissed],
  );

  return (
    <DialogContext.Provider
      value={{
        isDismissed: (dialogName) => dismissed[dialogName] || false,
        setDismissed: setDismissedImpl,
      }}
    >
      {children}
    </DialogContext.Provider>
  );
}

function loadDismissed(): { [dialogName: string]: boolean } {
  const jsonString = localStorage.getItem(DIALOG_DISMISSED_KEY);
  if (jsonString) {
    try {
      return JSON.parse(jsonString);
    } catch (_e) {
      localStorage.removeItem(DIALOG_DISMISSED_KEY);
    }
  }
  return {};
}
