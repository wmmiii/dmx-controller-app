import { VersatileContainer } from '../../contexts/VersatileContianer';
import styles from './DmxEditor.module.css';
import { DmxFixtureList } from './DmxFixtureList';
import { DmxUniverse } from './DmxUniverse';

export interface DraggableDmxFixture {
  id: bigint;
  definition: bigint;
  mode: string;
}

interface DmxEditorProps {
  outputId: bigint;
}

export function DmxEditor({ outputId }: DmxEditorProps) {
  return (
    <VersatileContainer className={styles.contents}>
      <DmxUniverse className={styles.grid} outputId={outputId} />
      <DmxFixtureList className={styles.list} outputId={outputId} />
    </VersatileContainer>
  );
}
