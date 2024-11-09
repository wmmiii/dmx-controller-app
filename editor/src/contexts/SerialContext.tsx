import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Modal } from "../components/Modal";
import { DialogContext } from "./DialogContext";
import IconBxErrorAlt from "../icons/IconBxErrorAlt";
import { DmxUniverse } from "../engine/fixture";

const BLACKOUT_UNIVERSE = new Uint8Array(512).fill(0);
const FPS_BUFFER_SIZE = 100;

type RenderUniverse = (frame: number) => DmxUniverse;

const EMPTY_CONTEXT = {
  port: null as (SerialPort | null),
  connect: () => { },
  disconnect: () => { },
  blackout: true,
  setBlackout: (_blackout: boolean) => { },
  setRenderUniverse: (_render: RenderUniverse) => { },
  clearRenderUniverse: (_render: RenderUniverse) => { },
  subscribeToUniverseUpdates: (_callback: (universe: DmxUniverse) => void) => { },
  subscribeToFspUpdates: (_callback: (fps: number) => void) => { },
};

export const SerialContext = createContext(EMPTY_CONTEXT);
const SERIAL_MISSING_KEY = 'serial-missing';

export function SerialProvider({ children }: PropsWithChildren): JSX.Element {
  const dialogContext = useContext(DialogContext);
  const [open, setOpen] =
    useState(!dialogContext.isDismissed(SERIAL_MISSING_KEY));

  if (!navigator.serial) {
    return (
      <SerialContext.Provider value={EMPTY_CONTEXT}>
        {children}
        {
          open &&
          <Modal
            title="Unsupported Browser"
            icon={<IconBxErrorAlt />}
            onClose={() => setOpen(false)}>
            <p>
              This browser does not support the <code>navigator.serial</code>
              &nbsp;api required for this app to function.
            </p>
            <p>
              You can modify project data but you will be unable to link this
              software to any DMX universe and visualize any output.
            </p>
            <p>
              Please download&nbsp;
              <a href="https://www.google.com/chrome/" target="_blank">Google
                Chrome</a> or another Chromium based browser that supports the
              &nbsp;<code>navigator.serial</code> api.
            </p>
          </Modal>
        }
      </SerialContext.Provider>
    );
  } else {
    return <SerialProviderImpl>{children}</SerialProviderImpl>;
  }
}

function SerialProviderImpl({ children }: PropsWithChildren): JSX.Element {
  const [port, setPort] = useState<SerialPort | null>(null);
  const renderUniverse = useRef<RenderUniverse>(() => BLACKOUT_UNIVERSE);
  const updateSubscribers = useRef<Array<(universe: DmxUniverse) => void>>([]);
  const frameRef = useRef(0);
  const blackout = useRef(false);
  const [blackoutState, setBlackoutState] = useState(false);
  const fpsBuffer = useRef([0]);
  const fpsSubscribers = useRef<Array<(fps: number) => void>>([]);

  // Expose render function for debugging purposes.
  useEffect(() => {
    const global = (window || globalThis) as any;
    global['debugRender'] = () => renderUniverse.current(frameRef.current);
  }, [renderUniverse]);

  const connect = useCallback(async () => {
    try {
      let port: SerialPort;
      const ports = await navigator.serial.getPorts();
      if (ports.length === 0 || port != null) {
        port = await navigator.serial.requestPort();
      } else {
        port = ports[0];
      }
      await port.open({
        baudRate: 192_000,
        dataBits: 8,
        flowControl: 'none',
        parity: 'none',
        stopBits: 2,
      });

      setPort(port);
    } catch (e) {
      console.error('Could not open serial port!', e);
    }
  }, [port]);

  const disconnect = useCallback(() => {
    port?.close();
    setPort(null);
  }, [port]);

  useEffect(() => {
    navigator.serial.onconnect = connect;
    navigator.serial.ondisconnect = disconnect;
  }, [connect, disconnect]);

  const resetFps = useCallback(() => {
    fpsSubscribers.current.forEach(s => s(NaN));
    fpsBuffer.current = [0];
  }, [fpsBuffer]);

  useEffect(() => {
    if (!port) {
      const handle = setInterval(() => {
        frameRef.current += 1;
        const universe = renderUniverse.current(frameRef.current);
        updateSubscribers.current.forEach(c => c(universe));
      }, 30);
      return () => clearInterval(handle);
    }

    const writer = port.writable.getWriter();

    let closed = false;
    let lastFrame = new Date().getTime();
    (async () => {
      while (!closed) {
        const start = new Date().getTime();

        let universe;
        if (blackout.current) {
          universe = BLACKOUT_UNIVERSE;
        } else {
          frameRef.current += 1;
          universe = renderUniverse.current(frameRef.current);
        }

        try {
          await writer.ready;
          await writer.write(universe);
          updateSubscribers.current.forEach(c => c(universe));
        } catch (e) {
          console.error('Could not write to serial port!', e);
          closed = true;
          resetFps();
          disconnect();
        }

        const now = new Date().getTime();
        fpsBuffer.current.push(now - lastFrame);
        fpsBuffer.current = fpsBuffer.current.slice(fpsBuffer.current.length - FPS_BUFFER_SIZE, fpsBuffer.current.length);
        let average = 0;
        for (const fps of fpsBuffer.current) {
          average += fps;
        }
        average /= fpsBuffer.current.length;
        fpsSubscribers.current.forEach((s) => s(Math.floor(1000 / average)));
        lastFrame = now;

        // This is needed because sometimes the micro-controller gets
        // overwhelmed. I don't know why and don't have time to debug.
        await new Promise((r) => setTimeout(r, 10));
      }
    })();

    return () => {
      closed = true;
      resetFps();
      writer.releaseLock();
    }

  }, [
    blackout,
    disconnect,
    port,
    renderUniverse,
    resetFps,
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
      subscribeToUniverseUpdates: useCallback((callback) => updateSubscribers.current.push(callback), [updateSubscribers]),
      subscribeToFspUpdates: useCallback((callback) => fpsSubscribers.current.push(callback), [fpsSubscribers]),
    }}>
      {children}
    </SerialContext.Provider>
  );
}