import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { ProjectContext } from "./ProjectContext";

const BLACKOUT_UNIVERSE = new Uint8Array(512).fill(0);

type RenderUniverse = () => Uint8Array;

export const SerialContext = createContext({
  port: null as (SerialPort | null),
  connect: () => { },
  disconnect: () => { },
  blackout: true,
  setBlackout: (_blackout: boolean) => { },
  setRenderUniverse: (_render: RenderUniverse) => { },
  clearRenderUniverse: (_render: RenderUniverse) => { },
});

export function SerialProvider({ children }: PropsWithChildren): JSX.Element {
  const { project } = useContext(ProjectContext);
  const [port, setPort] = useState<SerialPort | null>(null);
  const renderUniverse = useRef<RenderUniverse>(() => BLACKOUT_UNIVERSE);
  const blackout = useRef(false);
  const [blackoutState, setBlackoutState] = useState(false);
  const [updateFrequencyMs, setUpdateFrequencyMs] = useState(50);

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

  const disconnect = useCallback(() => {
    port?.close();
    setPort(null);
  }, [port]);

  useEffect(
    () => setUpdateFrequencyMs(project?.updateFrequencyMs || 50),
    [project?.updateFrequencyMs]);

  useEffect(() => {
    if (!port) {
      return;
    }

    const writer = port.writable.getWriter();

    let lock = false;

    const handle = setInterval(async () => {
      if (lock) {
        const newFreq = updateFrequencyMs + 1;
        console.error('Dropped frame! Increasing update interval to', newFreq);
        setUpdateFrequencyMs(newFreq);
        return;
      }

      lock = true;
      let universe;
      if (blackout.current) {
        universe = BLACKOUT_UNIVERSE;
      } else {
        universe = renderUniverse.current();
      }

      try {
        await writer.write(universe);
      } catch (e) {
        console.error(e);
        disconnect();
      } finally {
        lock = false;
      }
    }, updateFrequencyMs);

    return () => {
      clearInterval(handle);
      writer.releaseLock();
    }

  }, [
    blackout,
    disconnect,
    port,
    updateFrequencyMs,
    project,
    renderUniverse,
  ]);

  return (
    <SerialContext.Provider value={{
      port: port,
      connect: connect,
      disconnect: disconnect,
      blackout: blackoutState,
      setBlackout: (b: boolean) => {
        blackout.current = b;
        setBlackoutState(b);
      },
      setRenderUniverse: (r: RenderUniverse) => renderUniverse.current = r,
      clearRenderUniverse: (r: RenderUniverse) => {
        if (renderUniverse.current === r) {
          renderUniverse.current = () => BLACKOUT_UNIVERSE;
        }
      },
    }}>
      {children}
    </SerialContext.Provider>
  );
}