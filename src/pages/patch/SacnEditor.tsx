import { useContext } from 'react';
import { TextInput, ToggleInput } from '../../components/Input';
import { ProjectContext } from '../../contexts/ProjectContext';
import { getOutput } from '../../util/projectUtils';
import { DmxEditor } from './DmxEditor';
import styles from './PatchPage.module.scss';

interface SacnEditorProps {
  outputId: bigint;
}

export function SacnEditor({ outputId }: SacnEditorProps) {
  const { project, save } = useContext(ProjectContext);

  const output = getOutput(project, outputId);
  if (output.output.case !== 'sacnDmxOutput') {
    throw new Error('Passed non SACN output ID into SacnEditor.');
  }

  const sacnOutput = output.output.value;

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
          IP <span>Address</span>
          <TextInput
            value={sacnOutput.ipAddress}
            onChange={(ipAddress) => {
              sacnOutput.ipAddress = ipAddress;
              save(
                `Update address of WLED device ${output.name} to ${ipAddress}.`,
              );
            }}
          />
        </label>
      </div>
      <hr />
      <DmxEditor outputId={outputId} />
    </div>
  );
}
