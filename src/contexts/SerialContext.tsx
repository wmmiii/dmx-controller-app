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
import {
  DmxRenderOutput,
  RenderError,
  triggerDmxSubscriptions,
  triggerErrorSubscriptions,
} from '../engine/renderRouter';
import { renderDmx } from '../system_interfaces/engine';
import { outputLoopSupported } from '../system_interfaces/output_loop';
import {
  listPorts,
  outputDmx,
  serialInit,
  serialSupported,
} from '../system_interfaces/serial';
import { getOutput, getSerialOutputId } from '../util/projectUtils';
import { listenToTick } from '../util/time';
import { DialogContext } from './DialogContext';
import { ProjectContext } from './ProjectContext';
import { ShortcutContext } from './ShortcutContext';

const EMPTY_CONTEXT = {
  port: false,
  connect: () => {},
  disconnect: () => {},
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
      return (
        <SerialContext.Provider value={EMPTY_CONTEXT}>
          {children}
        </SerialContext.Provider>
      );
    }
  }
}

interface SerialProviderImplProps {
  children: React.ReactNode;
}

function SerialProviderImpl({
  children,
}: SerialProviderImplProps): JSX.Element {
  const { project, save, update } = useContext(ProjectContext);
  const { setShortcuts } = useContext(ShortcutContext);
  const frameRef = useRef(0);
  const [selectPort, setSelectPort] = useState<{
    ports: string[];
    callback: (port: string | null) => void;
  } | null>(null);

  const outputId = getSerialOutputId(project);
  const output = getOutput(project, outputId).output;

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
        if (output.case === 'serialDmxOutput') {
          output.value.lastPort = port ?? undefined;
          save(`Set serial port to ${port}.`);
        }
      }
    } catch (e) {
      console.error('Could not open serial port!', e);
    }
  }, [output]);

  const disconnect = useCallback(() => {
    if (output.case === 'serialDmxOutput') {
      output.value.lastPort = undefined;
      save(`Disconnect serial port.`);
    }
  }, [output]);

  useEffect(() => {
    serialInit(connect, disconnect);
  }, [connect, disconnect]);

  useEffect(() => {
    return setShortcuts([
      {
        shortcut: { key: 'KeyC' },
        action: () => connect(),
        description: 'Connect to serial output.',
      },
    ]);
  });

  useEffect(() => {
    if (output.case !== 'serialDmxOutput' || output.value.lastPort == null) {
      if (
        output.case === 'serialDmxOutput' &&
        Object.values(output.value.fixtures).length === 0
      ) {
        return () => {};
      } else {
        return listenToTick(() => {
          frameRef.current += 1;
          renderDmx(outputId, BigInt(new Date().getTime()), frameRef.current++);
        });
      }
    }

    // On Tauri, output loops are automatically managed by the backend
    // when the project is updated, so we don't need to start/stop them here.
    if (outputLoopSupported) {
      return () => {};
    }

    // Web fallback: run the loop in JavaScript
    let closed = false;
    const latencySamples: number[] = [];
    (async () => {
      while (!closed) {
        const startMs = new Date().getTime();
        let dmxOutput: DmxRenderOutput;

        try {
          dmxOutput = await renderDmx(
            outputId,
            BigInt(startMs),
            frameRef.current++,
          );
          // Trigger render subscriptions for visualizers
          triggerDmxSubscriptions(outputId, dmxOutput);
          // Clear any previous render errors
          triggerErrorSubscriptions(outputId, null);
        } catch (e) {
          const error: RenderError = {
            outputId,
            message: e instanceof Error ? e.message : String(e),
          };
          triggerErrorSubscriptions(outputId, error);
          console.error('Could not render DMX:', e);
          continue;
        }

        try {
          await outputDmx(outputId, dmxOutput);
          latencySamples.push(new Date().getTime() - startMs);
          // Clear any previous output errors
          triggerErrorSubscriptions(outputId, null);
        } catch (e) {
          const error: RenderError = {
            outputId,
            message: e instanceof Error ? e.message : String(e),
          };
          triggerErrorSubscriptions(outputId, error);
          console.error('Could not write to serial port!', e);
          closed = true;
          disconnect();
        }

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
    };
  }, [disconnect, output, outputId, update]);

  return (
    <SerialContext.Provider
      value={{
        port:
          output.case === 'serialDmxOutput' && output.value.lastPort != null,
        connect: connect,
        disconnect: disconnect,
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
