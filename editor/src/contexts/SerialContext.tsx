import { PropsWithChildren, createContext, useCallback, useState } from "react";

export const SerialContext = createContext({
  port: null as (SerialPort|null),
  connect: () => {},
  disconnect: () => {},
});

export function SerialProvider({children}: PropsWithChildren): JSX.Element {
  const [port, setPort] = useState<SerialPort|null>(null);

  const connect = useCallback(async () => {
    const forceReconnect = port != null;
    try {
      let port: SerialPort;
      const ports = await navigator.serial.getPorts();
      if (ports.length === 0 || forceReconnect) {
        port = await navigator.serial.requestPort();
      } else {
        port = ports[0];
      }
      await port.open({
        baudRate: 128000,
        dataBits: 8,
        flowControl: 'none',
        parity: 'none',
        stopBits: 2,
      });

      setPort(port);
    } catch (e) {
      console.error(e);
    }
  }, [port]);

  return (
    <SerialContext.Provider value={{
      port: port,
      connect: connect,
      disconnect: () => {
        port?.close();
        setPort(null);
      },
    }}>
      {children}
    </SerialContext.Provider>
  );
}