import {
  JSX,
  PropsWithChildren,
  createContext,
  useEffect,
  useRef,
} from 'react';

type TimeListener = (t: bigint) => void;

export const TimeContext = createContext({
  addListener: (_listener: TimeListener) => {},
  removeListener: (_listener: TimeListener) => {},
});

export function TimeProvider({ children }: PropsWithChildren): JSX.Element {
  const listeners = useRef<Array<TimeListener>>([]);

  useEffect(() => {
    const handle = setInterval(() => {
      const t = BigInt(new Date().getTime());
      listeners.current.forEach((l) => l(t));
    }, 50);
    return () => clearInterval(handle);
  }, []);

  return (
    <TimeContext.Provider
      value={{
        addListener: (l) => listeners.current.push(l),
        removeListener: (l) => {
          const index = listeners.current.indexOf(l);
          if (index > -1) {
            listeners.current.splice(index, 1);
          }
        },
      }}
    >
      {children}
    </TimeContext.Provider>
  );
}
