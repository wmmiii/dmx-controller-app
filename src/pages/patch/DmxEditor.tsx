import { useState } from 'react';
import { HorizontalSplitPane } from '../../components/SplitPane';

import { DmxFixtureList } from './DmxFixtureList';
import { DmxUniverse } from './DmxUniverse';
import styles from './PatchPage.module.scss';

interface DmxEditorProps {
  outputId: bigint;
}

export function DmxEditor({ outputId }: DmxEditorProps) {
  const [draggingFixture, setDraggingFixture] = useState<bigint | null>(null);

  return (
    <HorizontalSplitPane
      className={styles.splitPane}
      defaultAmount={0.65}
      left={
        <DmxUniverse
          outputId={outputId}
          draggingFixture={draggingFixture}
          setDraggingFixture={setDraggingFixture}
        />
      }
      right={
        <DmxFixtureList
          outputId={outputId}
          draggingFixture={draggingFixture}
          setDraggingFixture={setDraggingFixture}
        />
      }
    />
  );
}
