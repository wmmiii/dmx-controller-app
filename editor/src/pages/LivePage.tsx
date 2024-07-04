import React, { useContext, useEffect, useMemo, useState } from 'react';
import { HorizontalSplitPane } from '../components/SplitPane';
import { Scene } from '@dmx-controller/proto/scene_pb';
import { ProjectContext } from '../contexts/ProjectContext';
import { Button } from '../components/Button';
import styles from "./LivePage.module.scss";
import { UniverseSequence } from '@dmx-controller/proto/universe_sequence_pb';
import { nextId } from '../util/mapUtils';
import { BeatContext, BeatProvider } from '../contexts/BeatContext';
import { ShortcutContext } from '../contexts/ShortcutContext';
import { UniverseSequenceEditor } from '../components/UniverseSequenceEditor';

interface Selected {
  type: 'scene' | 'sequence'
  index: number;
}

export function LivePage(): JSX.Element {
  const [selected, setSelected] = useState<Selected | null>(null);

  return (
    <BeatProvider>
      <HorizontalSplitPane
        className={styles.wrapper}
        defaultAmount={0.2}
        left={<List selected={selected} setSelected={setSelected} />}
        right={<EditorPane selected={selected} />} />
    </BeatProvider>
  );
}

interface SceneListProps {
  selected: Selected;
  setSelected: (elected: Selected) => void;
}

function List({ selected, setSelected }: SceneListProps): JSX.Element {
  const { project, save } = useContext(ProjectContext);

  if (!project) {
    return null;
  }

  return (
    <>
      <h2>Scenes</h2>
      <ul>
        {
          project.scenes.map((s, i) => (
            <li
              key={i}
              onMouseDown={() => setSelected({ type: 'scene', index: i })}>
              {
                selected?.index === i && selected?.type === 'scene' ?
                  <strong>{s.name}</strong> :
                  s.name
              }
            </li>
          ))
        }
        <li>
          <Button onClick={() => {
            project.scenes.push(new Scene({
              name: 'Untitled Scene',
              components: [],
            }));
            project.activeScene = project.scenes.length - 1;
            save();
          }}>
            + Create New Scene
          </Button>
        </li>
      </ul>
      <h2>Sequences</h2>
      <ul>
        {
          Object.keys(project.universeSequences)
            .map(parseInt)
            .map((id: number) => {
              const sequence = project.universeSequences[id];
              return (
                <li
                  key={id}
                  onMouseDown={() => setSelected({ type: 'sequence', index: id })}>
                  {
                    selected?.index === id && selected?.type === 'sequence' ?
                      <strong>{sequence.name}</strong> :
                      sequence.name
                  }
                </li>
              );
            })
        }
        <li>
          <Button onClick={() => {
            const id = nextId(project.universeSequences);
            project.universeSequences[id] = new UniverseSequence({
              name: 'Untitled Sequence',
              nativeBeats: 1,
              lightTracks: [],
            });
            save();
          }}>
            + Create New Sequence
          </Button>
        </li>
      </ul>
    </>
  );
}

interface EditorPaneProps {
  selected: Selected;
}

function EditorPane({ selected }: EditorPaneProps): JSX.Element {
  const { project, save } = useContext(ProjectContext);

  return (
    <div className={styles.editorPane}>
      <Beat />
      {
        selected?.type === 'sequence' ?
          <UniverseSequenceEditor
            className={styles.universeSequenceEditor}
            universeSequenceId={selected.index} /> :
          <>Not implemented yet...</>
      }

    </div>
  );
}

function Beat(): JSX.Element {
  const { beat, sampleQuality, addBeatSample } = useContext(BeatContext);
  const { setShortcuts } = useContext(ShortcutContext);

  useEffect(() => setShortcuts([
    {
      shortcut: {
        key: 'Space',
      },
      action: () => addBeatSample(new Date().getTime()),
      description: 'Sample beat',
    },
  ]), [addBeatSample, setShortcuts]);

  const beatEmoji = useMemo(() => {
    switch (sampleQuality) {
      case 'excellent': return '🤩';
      case 'fair': return '🙂';
      case 'idle': return '😎';
      case 'not enough samples': return '😄';
      case 'poor': return '😵‍💫';
    }
  }, [sampleQuality]);

  return (
    <div className={styles.beat}>
      {beatEmoji}
      &nbsp;BPM: {Math.floor(60_000 / (beat?.lengthMs || NaN))}
    </div>
  );
}
