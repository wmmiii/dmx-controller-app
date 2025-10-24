import { useContext } from 'react';
import { TextInput } from '../../components/Input';
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
      <label>
        IP Address
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
      <div>
        <DmxEditor outputId={outputId} />
      </div>
    </div>
  );
}
