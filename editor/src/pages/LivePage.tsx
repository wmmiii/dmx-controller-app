import React, { useContext, useEffect, useState } from 'react';
import { HorizontalSplitPane } from '../components/SplitPane';
import { Scene } from '@dmx-controller/proto/scene_pb';
import { ProjectContext } from '../contexts/ProjectContext';
import { Button } from '../components/Button';
import styles from "./LivePage.module.scss";
import { UniverseSequence } from '@dmx-controller/proto/universe_sequence_pb';
import { nextId } from '../util/mapUtils';
import { BeatContext, BeatProvider } from '../contexts/BeatContext';
import { UniverseSequenceEditor } from '../components/UniverseSequenceEditor';
import { SceneEditor } from '../components/SceneEditor';
import { SerialContext } from '../contexts/SerialContext';
import { renderSceneToUniverse } from '../engine/universe';

export function LivePage(): JSX.Element {
  return (
    <BeatProvider>
      <LivePageImpl />
    </BeatProvider>
  );
}

interface Selected {
  type: 'scene' | 'sequence'
  index: number;
}

function LivePageImpl(): JSX.Element {
  const { project } = useContext(ProjectContext);
  const { beat: beatMetadata } = useContext(BeatContext);
  const { setRenderUniverse, clearRenderUniverse } = useContext(SerialContext);

  const [selected, setSelected] = useState<Selected | null>(null);

  useEffect(() => {
    if (selected == null && project?.activeScene != null) {
      setSelected({
        type: 'scene',
        index: project.activeScene,
      });
    }
  }, [project?.activeScene, selected]);

  useEffect(() => {
    if (!project || selected?.type !== 'scene') {
      return;
    }

    const render = () => renderSceneToUniverse(
      new Date().getTime(),
      beatMetadata,
      project,
    );
    setRenderUniverse(render);

    return () => clearRenderUniverse(render);
  }, [selected, beatMetadata, project]);

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
            save('Create new scene.');
            setSelected({
              type: 'scene',
              index: project.scenes.length - 1,
            });
          }}>
            + Create New Scene
          </Button>
        </li>
      </ul>
      <h2>Sequences</h2>
      <ul>
        {
          Object.keys(project.universeSequences)
            .map((id) => parseInt(id, 10))
            .map((id: number) => {
              const sequence = project.universeSequences[id];
              if (!sequence) {
                return;
              }

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
            save('Create new sequence.');
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
      {
        selected?.type === 'sequence' &&
        <UniverseSequenceEditor
          className={styles.universeSequenceEditor}
          universeSequenceId={selected.index} />
      }
      {
        selected?.type === 'scene' && project.scenes[selected.index] &&
        <SceneEditor
          className={styles.sceneEditor}
          sceneId={selected.index}
          onDelete={() => {
            const name = project.scenes[selected.index].name;
            project.scenes.splice(selected.index, 1);
            if (project.activeScene === selected.index) {
              project.activeScene = 0;
            }
            save(`Delete scene ${name}.`);
          }} />
      }
    </div>
  );
}
