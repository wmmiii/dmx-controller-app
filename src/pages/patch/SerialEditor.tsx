import { useContext, useEffect, useMemo, useState } from 'react';
import { ToggleInput } from '../../components/Input';
import { SelectCategory, SelectInput } from '../../components/SelectInput';
import { ProjectContext } from '../../contexts/ProjectContext';
import { listPorts } from '../../system_interfaces/serial';
import { getOutput } from '../../util/projectUtils';
import { DmxEditor } from './DmxEditor';
import styles from './PatchPage.module.scss';

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
    const items: SelectCategory<string>[] = [
      {
        label: 'Available ports',
        options: ports.map((p) => ({
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
        options: [
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
    <div className={styles.body}>
      <div className={styles.meta}>
        <label>
          <span>Enabled</span>
          <ToggleInput
            className={styles.enabledToggle}
            value={output.enabled}
            onChange={(value) => {
              output.enabled = value;
              save(`${value ? 'Enabled' : 'Disabled'} output ${output.name}`);
            }}
          />
        </label>
        <label>
          <span>Serial Port</span>
          <SelectInput<string>
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
            onClear={() => {
              if (output.output.case === 'serialDmxOutput') {
                output.output.value.lastPort = undefined;
                save(`Disconnect port for ${output.name}`);
              }
            }}
            onFocus={refreshPorts}
            placeholder="Select or enter serial port"
            options={options}
            onBlur={(value) => {
              if (value && output.output.case === 'serialDmxOutput') {
                output.output.value.lastPort = value;
                save(`Set port for ${output.name} to ${value}.`);
              }
            }}
          />
        </label>
      </div>
      <hr />
      <DmxEditor outputId={outputId} />
    </div>
  );
}
