import { VersatileContainer } from '../../contexts/VersatileContianer';
import { DmxFixtureList } from './DmxFixtureList';
import { DmxUniverse } from './DmxUniverse';
import styles from './PatchPage.module.scss';

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
      <DmxUniverse outputId={outputId} />
      <DmxFixtureList outputId={outputId} />
    </VersatileContainer>
  );
}
