import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useState } from "react";
import { ProjectContext } from "./ProjectContext";
import { render } from "react-dom";

const BLACKOUT_UNIVERSE = new Uint8Array(512).fill(0);

type RenderUniverse = () => Uint8Array;

export const SerialContext = createContext({
  port: null as (SerialPort | null),
  connect: () => { },
  disconnect: () => { },
  setBlackout: (_blackout: boolean) => { },
  setRenderUniverse: (_render: RenderUniverse) => { },
  clearRenderUniverse: (_render: RenderUniverse) => { },
});

export function SerialProvider({ children }: PropsWithChildren): JSX.Element {
  const { project } = useContext(ProjectContext);
  const [port, setPort] = useState<SerialPort | null>(null);
  const [renderUniverse, setRenderUniverse] =
    useState<RenderUniverse|null>(null);
  const [blackout, setBlackout] = useState(false);

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

  useEffect(() => {
    if (!port || renderUniverse == null) {
      return;
    }

    const writer = port.writable.getWriter();

    const handle = setInterval(async () => {
      let universe: Uint8Array;
      if (blackout) {
        universe = BLACKOUT_UNIVERSE;
      } else {
        universe = renderUniverse();
      }

      try {
        await writer.write(universe);
      } catch (e) {
        console.error(e);
        disconnect();
      }
    }, project.updateFrequencyMs);

    return () => {
      clearInterval(handle);
      writer.releaseLock();
    }

  }, [
    blackout,
    disconnect,
    port,
    project,
    renderUniverse,
  ]);

  return (
    <SerialContext.Provider value={{
      port: port,
      connect: connect,
      disconnect: disconnect,
      setBlackout: setBlackout,
      setRenderUniverse: (r: RenderUniverse) => setRenderUniverse(() => r),
      clearRenderUniverse: (r: RenderUniverse) => {
        if (renderUniverse === r) {
          setRenderUniverse(null);
        }
      },
    }}>
      {children}
    </SerialContext.Provider>
  );
}