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
import { DmxRenderOutput, renderDmx } from '../engine/renderRouter';
import {
  closePort,
  listPorts,
  openPort,
  outputDmx,
  serialInit,
  serialSupported,
} from '../system_interfaces/serial';
import { getOutput, getSerialOutputId } from '../util/projectUtils';
import { DialogContext } from './DialogContext';
import { ProjectContext } from './ProjectContext';
import { ShortcutContext } from './ShortcutContext';

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
  port: false,
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

  if (!serialSupported) {
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
  const { project, update } = useContext(ProjectContext);
  const { setShortcuts } = useContext(ShortcutContext);
  const [port, setPort] = useState<boolean>(false);
  const frameRef = useRef(0);
  const blackout = useRef(false);
  const [blackoutState, setBlackoutState] = useState(false);
  const fpsBuffer = useRef([0]);
  const fpsSubscribers = useRef<Array<(fps: number) => void>>([]);
  const [selectPort, setSelectPort] = useState<{
    ports: string[];
    callback: (port: string | null) => void;
  } | null>(null);

  const outputId = getSerialOutputId(project);

  const connect = useCallback(async () => {
    try {
      let port: string | null;
      const ports = await listPorts();
      if (ports != null) {
        port = await new Promise((resolve) =>
          setSelectPort({
            ports: ports,
            callback: resolve,
          }),
        );
        setSelectPort(null);
        if (port) {
          await openPort(outputId, port);
          setPort(true);
        } else {
          setPort(false);
        }
      } else {
        await openPort(outputId, null);
        setPort(true);
      }
    } catch (e) {
      console.error('Could not open serial port!', e);
    }
  }, [port]);

  const disconnect = useCallback(() => {
    closePort(outputId);
    setPort(false);
  }, [port]);

  useEffect(() => {
    serialInit(connect, disconnect);
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
        renderDmx(outputId, frameRef.current++);
      }, 30);
      return () => clearInterval(handle);
    }

    let closed = false;
    let lastFrame = new Date().getTime();
    const latencySamples: number[] = [];
    (async () => {
      while (!closed) {
        const startMs = new Date().getTime();
        let dmxOutput: DmxRenderOutput;
        if (blackout.current) {
          dmxOutput = new Uint8Array(512);
        } else {
          dmxOutput = await renderDmx(outputId, frameRef.current++);
        }

        try {
          await outputDmx(outputId, dmxOutput);
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
          const latency = Math.floor(total / latencySamples.length) + 50;
          getOutput(project, outputId).latencyMs = latency;
          latencySamples.length = 0;
          update();
        }
      }
    })();

    return () => {
      closed = true;
      resetFps();
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
      {selectPort && (
        <Modal
          title="Select Serial Port"
          onClose={() => selectPort.callback(null)}
        >
          <ol>
            {selectPort.ports.map((port, i) => (
              <li key={i} onClick={() => selectPort.callback(port)}>
                {port}
              </li>
            ))}
          </ol>
        </Modal>
      )}
      {children}
    </SerialContext.Provider>
  );
}
