import React, { useContext, useEffect, useState } from 'react';
import { Scene, Scene_Component, Scene_Component_EffectComponent, Scene_Component_SequenceComponent } from '@dmx-controller/proto/scene_pb';
import { ProjectContext } from '../contexts/ProjectContext';
import styles from "./LivePage.module.scss";
import { BeatContext, BeatProvider } from '../contexts/BeatContext';
import { ComponentList } from '../components/ComponentList';
import { SerialContext } from '../contexts/SerialContext';
import { renderSceneToUniverse as renderActiveSceneToUniverse } from '../engine/universe';
import { Modal } from '../components/Modal';
import { HorizontalSplitPane } from '../components/SplitPane';
import { NumberInput, TextInput } from '../components/Input';
import { Effect } from '@dmx-controller/proto/effect_pb';
import { UniverseSequenceEditor } from '../components/UniverseSequenceEditor';

export function LivePage(): JSX.Element {
  const { project } = useContext(ProjectContext);
  const { beat: beatMetadata } = useContext(BeatContext);
  const { setRenderUniverse, clearRenderUniverse } = useContext(SerialContext);

  const [selected, setSelected] = useState<Scene_Component | null>(null);

  useEffect(() => {
    if (!project) {
      return;
    }

    const render = (frame: number) => renderActiveSceneToUniverse(
      new Date().getTime(),
      beatMetadata,
      frame,
      project,
    );
    setRenderUniverse(render);

    return () => clearRenderUniverse(render);
  }, [selected, beatMetadata, project]);

  return (
    <BeatProvider>
      <ComponentList
        className={styles.sceneEditor}
        sceneId={0}
        onSelect={setSelected} />
      {
        selected &&
        <ComponentEditor component={selected} onClose={() => setSelected(null)} />
      }
    </BeatProvider>
  );
}

interface ComponentEditorProps {
  component: Scene_Component;
  onClose: () => void;
}

function ComponentEditor({ component, onClose }: ComponentEditorProps) {
  const { save } = useContext(ProjectContext);

  return (
    <Modal
      title={`Edit Component "${component.name}"`}
      fullScreen={true}
      onClose={onClose}>
      <HorizontalSplitPane
        className={styles.splitPane}
        defaultAmount={0.15}
        left={
          <div className={styles.metaPane}>
            <label>
              Name&nbsp;
              <TextInput
                value={component.name}
                onChange={(v) => {
                  component.name = v;
                  save(`Change component name to "${v}".`);
                }} />
            </label>
            <label>
              Shortcut&nbsp;
              <input
                className={styles.shortcut}
                onChange={() => { }}
                onKeyDown={(e) => {
                  if (e.code.startsWith('Digit')) {
                    component.shortcut = e.code.substring(5);
                    save(`Add shortcut ${component.shortcut} for component ${name}.`);
                  } else if (e.code === 'Backspace' || e.code === 'Delete') {
                    save(`Remove shortcut for component ${name}.`);
                  }
                }}
                value={component.shortcut} />
            </label>
          </div>
        }
        right={
          component.description.case === 'effect' ?
            <EffectEditor effect={component.description.value} /> :
            <SequenceEditor sequence={component.description.value} />
        } />
    </Modal>
  );
}

interface EffectEditorProps {
  effect: Scene_Component_EffectComponent;
}

function EffectEditor({ effect }: EffectEditorProps) {
  return (
    <div className={styles.detailsPane}>
      Effect
    </div>
  );
}

interface SequenceEditorProps {
  sequence: Scene_Component_SequenceComponent;
}

function SequenceEditor({ sequence }: SequenceEditorProps) {
  return (
    <div className={styles.detailsPane}>
      <UniverseSequenceEditor 
      className={styles.detailsPane}
      sequence={sequence} />
    </div>
  );
}
