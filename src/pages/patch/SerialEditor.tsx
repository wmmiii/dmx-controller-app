import { useContext, useEffect, useMemo, useState } from 'react';
import { Combobox, ComboboxGroup } from '../../components/Combobox';
import { ProjectContext } from '../../contexts/ProjectContext';
import { listPorts } from '../../system_interfaces/serial';
import { getOutput } from '../../util/projectUtils';
import { DmxEditor } from './DmxEditor';
import { OutputFrame } from './OutputFrame';
import styles from './SerialEditor.module.css';

interface SacnEditorProps {
  outputId: bigint;
}

export function SerialEditor({ outputId }: SacnEditorProps) {
  const { project, save } = useContext(ProjectContext);
  const [ports, setPorts] = useState<string[]>([]);

  const refreshPorts = () => {
    listPorts().then((p) => {
      if (p) {
        // Filter out any empty strings or null values
        setPorts(p.filter((port) => port && port.trim() !== ''));
      }
    });
  };

  useEffect(() => {
    refreshPorts();
  }, []);

  const output = getOutput(project, outputId);
  if (output.output.case !== 'serialDmxOutput') {
    throw new Error('Passed non serial output ID into SerialEditor.');
  }

  if (output.output.value.lastPort === '') {
    output.output.value.lastPort = undefined;
  }

  const options = useMemo(() => {
    const items: ComboboxGroup<string>[] = [
      {
        label: 'Available ports',
        items: ports.map((p) => ({
          label: p,
          value: p,
        })),
      },
    ];

    const port =
      output.output.case === 'serialDmxOutput'
        ? output.output.value.lastPort
        : undefined;
    if (port && ports.indexOf(port) === -1) {
      items.unshift({
        label: 'Unavailable ports',
        items: [
          {
            label: port,
            value: port,
          },
        ],
      });
    }

    return items;
  }, [ports, output]);

  return (
    <OutputFrame
      outputEnabled={output.enabled}
      setOutputEnabled={(value) => {
        output.enabled = value;
        save(`${value ? 'Enabled' : 'Disabled'} output ${output.name}`);
      }}
      fps={output.fps}
      setFps={(fps) => {
        output.fps = fps;
        save(`Set FPS for ${output.name} to ${fps}.`);
      }}
      settings={
        <label>
          <span>Serial Port</span>
          &emsp;
          <Combobox<string>
            className={styles.portSelect}
            value={output.output.value.lastPort}
            onChange={(value) => {
              if (output.output.case === 'serialDmxOutput') {
                output.output.value.lastPort = value || undefined;
                save(
                  value
                    ? `Set port for ${output.name} to ${value}.`
                    : `Disconnect port for ${output.name}`,
                );
              }
            }}
            onFocus={refreshPorts}
            placeholder="Select or enter serial port"
            options={options}
          />
        </label>
      }
    >
      <DmxEditor outputId={outputId} />
    </OutputFrame>
  );
}
