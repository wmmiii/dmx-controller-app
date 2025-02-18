import { PropsWithChildren, createContext, useEffect, useState } from 'react';

export const TimeContext = createContext({
  t: 0n,
});

export function TimeProvider({ children }: PropsWithChildren): JSX.Element {
  const [t, setT] = useState(BigInt(new Date().getTime()));

  useEffect(() => {
    setInterval(() => {
      setT(BigInt(new Date().getTime()));
    }, 100);
  }, []);

  return (
    <TimeContext.Provider value={{t}}>
      {children}
    </TimeContext.Provider>
  );
}
