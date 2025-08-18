import {
  JSX,
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import { Modal } from '../components/Modal';

import { BiErrorAlt } from 'react-icons/bi';
import { WritableDmxOutput } from '../engine/context';
import { getDmxWritableOutput } from '../engine/outputs/dmxOutput';
import { getOutput, getSerialOutputId } from '../util/projectUtils';
import { DialogContext } from './DialogContext';
import { ProjectContext } from './ProjectContext';
import { RenderingContext } from './RenderingContext';
import { ShortcutContext } from './ShortcutContext';

type SerialPort = any;

export const BLACKOUT_UNIVERSE: WritableDmxOutput = {
  type: 'dmx',
  latencyMs: 0,
  universe: new Array(512).fill(0),
  nonInterpolatedIndices: [],
  outputId: BigInt(0),
  uint8Array: new Uint8Array(512),
  clone: () => {
    throw Error('Cannot clone blackout universe!');
  },
  interpolate: () => {
    throw Error('Cannot interpolate blackout universe!');
  },
};
const FPS_BUFFER_SIZE = 100;

const EMPTY_CONTEXT = {
  port: null as SerialPort | null,
  connect: () => {},
  disconnect: () => {},
  blackout: true,
  setBlackout: (_blackout: boolean) => {},
  subscribeToFspUpdates: (_callback: (fps: number) => void) => {},
};

export const SerialContext = createContext(EMPTY_CONTEXT);
const SERIAL_MISSING_KEY = 'serial-missing';

export function SerialProvider({ children }: PropsWithChildren): JSX.Element {
  const dialogContext = useContext(DialogContext);
  const { project } = useContext(ProjectContext);
  const [open, setOpen] = useState(
    !dialogContext.isDismissed(SERIAL_MISSING_KEY),
  );

  if (!(navigator as any).serial) {
    return (
      <SerialContext.Provider value={EMPTY_CONTEXT}>
        {children}
        {open && (
          <Modal
            title="Unsupported Browser"
            icon={<BiErrorAlt />}
            onClose={() => setOpen(false)}
          >
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
              <a href="https://www.google.com/chrome/" target="_blank">
                Google Chrome
              </a>{' '}
              or another Chromium based browser that supports the &nbsp;
              <code>navigator.serial</code> api.
            </p>
          </Modal>
        )}
      </SerialContext.Provider>
    );
  } else {
    const outputId = getSerialOutputId(project);
    if (outputId) {
      return <SerialProviderImpl>{children}</SerialProviderImpl>;
    } else {
      return <SerialContext.Provider value={EMPTY_CONTEXT} />;
    }
  }
}

interface SerialProviderImplProps {
  children: React.ReactNode;
}

function SerialProviderImpl({
  children,
}: SerialProviderImplProps): JSX.Element {
  const { renderFunction } = useContext(RenderingContext);
  const { project, update } = useContext(ProjectContext);
  const { setShortcuts } = useContext(ShortcutContext);
  const [port, setPort] = useState<SerialPort | null>(null);
  const frameRef = useRef(0);
  const blackout = useRef(false);
  const [blackoutState, setBlackoutState] = useState(false);
  const fpsBuffer = useRef([0]);
  const fpsSubscribers = useRef<Array<(fps: number) => void>>([]);

  const outputId = getSerialOutputId(project);

  const connect = useCallback(async () => {
    try {
      let port: SerialPort;
      const ports = await (navigator as any).serial.getPorts();
      if (ports.length === 0 || port != null) {
        port = await (navigator as any).serial.requestPort();
      } else {
        port = ports[0];
      }
      await port.open({
        baudRate: 192_000,
        dataBits: 8,
        flowControl: 'none',
        parity: 'none',
        stopBits: 2,
        bufferSize: 512,
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
    (navigator as any).serial.onconnect = connect;
    (navigator as any).serial.ondisconnect = disconnect;
  }, [connect, disconnect]);

  useEffect(() => {
    return setShortcuts([
      {
        shortcut: { key: 'KeyB' },
        action: () => setBlackoutState(!blackoutState),
        description: 'Toggle output blackout.',
      },
      {
        shortcut: { key: 'KeyC' },
        action: () => connect(),
        description: 'Connect to serial output.',
      },
    ]);
  });

  const resetFps = useCallback(() => {
    fpsSubscribers.current.forEach((s) => s(NaN));
    fpsBuffer.current = [0];
  }, [fpsBuffer]);

  useEffect(() => {
    if (!port) {
      const handle = setInterval(() => {
        frameRef.current += 1;
        const output = getDmxWritableOutput(project, outputId);
        renderFunction.current(frameRef.current, output);
      }, 30);
      return () => clearInterval(handle);
    }

    const writer = port.writable.getWriter();

    let closed = false;
    let lastFrame = new Date().getTime();
    const latencySamples: number[] = [];
    (async () => {
      while (!closed) {
        const startMs = new Date().getTime();
        let serialOutput: WritableDmxOutput;
        if (blackout.current) {
          serialOutput = BLACKOUT_UNIVERSE;
        } else {
          serialOutput = getDmxWritableOutput(project, outputId);
          frameRef.current += 1;
          renderFunction.current(frameRef.current, serialOutput);
        }

        try {
          await writer.ready;
          await writer.write(serialOutput.uint8Array);
          latencySamples.push(new Date().getTime() - startMs);
        } catch (e) {
          console.error('Could not write to serial port!', e);
          closed = true;
          resetFps();
          disconnect();
        }

        const now = new Date().getTime();
        fpsBuffer.current.push(now - lastFrame);
        fpsBuffer.current = fpsBuffer.current.slice(
          fpsBuffer.current.length - FPS_BUFFER_SIZE,
          fpsBuffer.current.length,
        );
        let average = 0;
        for (const fps of fpsBuffer.current) {
          average += fps;
        }
        average /= fpsBuffer.current.length;
        fpsSubscribers.current.forEach((s) => s(Math.floor(1000 / average)));
        lastFrame = now;

        if (latencySamples.length >= 40) {
          const total = latencySamples.reduce((a, b) => a + b);
          // Added latency for decoding and sending the packet down the DMX line.
          const latency = Math.floor(total / latencySamples.length) + 70;
          getOutput(project, outputId).latencyMs = latency;
          latencySamples.length = 0;
          update();
        }
      }
    })();

    return () => {
      closed = true;
      resetFps();
      writer.releaseLock();
    };
  }, [blackout, disconnect, port, outputId, resetFps, update]);

  return (
    <SerialContext.Provider
      value={{
        port: port,
        connect: connect,
        disconnect: disconnect,
        blackout: blackoutState,
        setBlackout: (b: boolean) => {
          blackout.current = b;
          setBlackoutState(b);
        },
        subscribeToFspUpdates: useCallback(
          (callback) => fpsSubscribers.current.push(callback),
          [fpsSubscribers],
        ),
      }}
    >
      {children}
    </SerialContext.Provider>
  );
}
