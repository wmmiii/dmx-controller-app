import { useContext } from 'react';
import { ToggleInput } from '../../components/Input';
import { ProjectContext } from '../../contexts/ProjectContext';
import { getOutput } from '../../util/projectUtils';
import { DmxEditor } from './DmxEditor';
import styles from './PatchPage.module.scss';

interface SacnEditorProps {
  outputId: bigint;
}

export function SerialEditor({ outputId }: SacnEditorProps) {
  const { project, save } = useContext(ProjectContext);

  const output = getOutput(project, outputId);
  if (output.output.case !== 'serialDmxOutput') {
    throw new Error('Passed non serial output ID into SerialEditor.');
  }

  return (
    <div className={styles.body}>
      <label>
        Enabled
        <ToggleInput
          className={styles.enabledToggle}
          value={output.enabled}
          onChange={(value) => {
            output.enabled = value;
            save(`${value ? 'Enabled' : 'Disabled'} output ${output.name}`);
          }}
        />
      </label>
      <hr />
      <div>
        <DmxEditor outputId={outputId} />
      </div>
    </div>
  );
}
