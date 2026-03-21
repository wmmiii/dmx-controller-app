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

import { renderDmx } from '../system_interfaces/engine';
import { listPorts } from '../system_interfaces/serial';
import { getOutput, getSerialOutputId } from '../util/projectUtils';
import { listenToTick } from '../util/time';
import { ProjectContext } from './ProjectContext';
import { ShortcutContext } from './ShortcutContext';

const EMPTY_CONTEXT = {
  port: false,
  connect: () => {},
  disconnect: () => {},
};

export const SerialContext = createContext(EMPTY_CONTEXT);

export function SerialProvider({ children }: PropsWithChildren): JSX.Element {
  const { project } = useContext(ProjectContext);

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

interface SerialProviderImplProps {
  children: React.ReactNode;
}

function SerialProviderImpl({
  children,
}: SerialProviderImplProps): JSX.Element {
  const { project, save } = useContext(ProjectContext);
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
    return setShortcuts([
      {
        shortcut: { key: 'KeyC' },
        action: () => connect(),
        description: 'Connect to serial output.',
      },
    ]);
  });

  useEffect(() => {
    // When no port is selected and no fixtures are configured, keep rendering
    // to ensure the engine state stays updated (for visualizers, etc.)
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

    // Tauri handles output loops automatically when the project is updated
    return () => {};
  }, [disconnect, output, outputId]);

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
