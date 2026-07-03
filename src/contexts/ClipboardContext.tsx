import { Message } from '@bufbuild/protobuf';
import { GenMessage } from '@bufbuild/protobuf/codegenv2';
import { PropsWithChildren, createContext, useContext, useState } from 'react';

interface ClipboardContextValue {
  get: <T extends Message>(schema: GenMessage<T>) => T | undefined;
  set: <T extends Message>(message: T) => void;
  has: <T extends Message>(schema: GenMessage<T>) => boolean;
}

const ClipboardContext = createContext<ClipboardContextValue>({
  get: (_t) => undefined,
  set: (_m) => {},
  has: (_t) => false,
});

export function ClipboardProvider({ children }: PropsWithChildren) {
  const [clipboardMap, setClipboardMap] = useState<Map<string, Message>>(
    new Map(),
  );

  return (
    <ClipboardContext.Provider
      value={{
        get: <T extends Message>(schema: GenMessage<T>) =>
          clipboardMap.get(schema.typeName) as T | undefined,
        set: <T extends Message>(message: T) => {
          setClipboardMap((prev) => {
            const next = new Map(prev);
            next.set(message.$typeName, message);
            return next;
          });
        },
        has: <T extends Message>(schema: GenMessage<T>) =>
          clipboardMap.has(schema.typeName),
      }}
    >
      {children}
    </ClipboardContext.Provider>
  );
}

export function useClipboard(): ClipboardContextValue {
  const context = useContext(ClipboardContext);
  if (context === null) {
    throw new Error('useClipboard must be used within a ClipboardProvider');
  }
  return context;
}
