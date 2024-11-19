import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Scene_Component, Scene_Component_EffectComponent, Scene_Component_SequenceComponent } from '@dmx-controller/proto/scene_pb';
import { ProjectContext } from '../contexts/ProjectContext';
import styles from "./LivePage.module.scss";
import { BeatContext, BeatProvider } from '../contexts/BeatContext';
import { SerialContext } from '../contexts/SerialContext';
import { renderSceneToUniverse as renderActiveSceneToUniverse } from '../engine/universe';
import { Modal } from '../components/Modal';
import { HorizontalSplitPane } from '../components/SplitPane';
import { NumberInput, TextInput, ToggleInput } from '../components/Input';
import { UniverseSequenceEditor } from '../components/UniverseSequenceEditor';
import { LiveBeat } from '../components/LiveBeat';
import { EffectDetails } from '../components/Effect';
import { getOutputName, OutputDescription, OutputSelector } from '../components/OutputSelector';
import { ComponentGrid } from '../components/ComponentGrid';
import { IconButton } from '../components/Button';
import IconBxBrushAlt from '../icons/IconBxBrush';


export function LivePage(): JSX.Element {
  return (
    <BeatProvider>
      <LivePageImpl />
    </BeatProvider>
  );
}

function LivePageImpl(): JSX.Element {
  const { project, save } = useContext(ProjectContext);
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
      <div className={styles.wrapper}>
        <div className={styles.header}>
          <LiveBeat className={styles.beat} />
          <IconButton
            title="Cleanup rows"
            onClick={() => {
              project.scenes[0].rows = project.scenes[0].rows.filter(r => r.components.length > 0);
              save('Cleanup rows.');
            }}>
            <IconBxBrushAlt />
          </IconButton>
        </div>
        <ComponentGrid
          className={styles.sceneEditor}
          sceneId={0}
          onSelect={setSelected} />
      </div>
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
            <h2>Live Details</h2>
            <div className={styles.row}>
              <label>Name</label>
              <TextInput
                value={component.name}
                onChange={(v) => {
                  component.name = v;
                  save(`Change component name to "${v}".`);
                }} />
            </div>
            <div className={styles.row}>
              <label>Shortcut</label>
              <input
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
            </div>
            <div className={styles.row}>
              <ToggleInput
                className={styles.switch}
                value={component.duration?.case === 'durationMs'}
                onChange={(value) => {
                  if (value) {
                    component.duration = {
                      case: 'durationMs',
                      value: 1000,
                    }
                  } else {
                    component.duration.case = undefined;
                    component.duration.value = undefined;
                  }
                  save(`Set timing type for component ${name} to ${value ? 'seconds' : 'beats'}.`);
                }}
                labels={{ left: 'Beat', right: 'Seconds' }} />
            </div>
            {
              component.duration.case === 'durationMs' &&
              <div className={styles.row}>
                <label>Loop Duration</label>
                <NumberInput
                  type='float'
                  min={0.001}
                  max={300}
                  value={component.duration?.value / 1000 || NaN}
                  onChange={(value) => {
                    component.duration.value = Math.floor(value * 1000);
                    save(`Set duration for component ${component.name}.`);
                  }}
                  disabled={component.duration?.case !== 'durationMs'} />
              </div>
            }
            <div className={styles.row}>
              <label>Fade in</label>
              <NumberInput
                type='float'
                title='Fade in seconds'
                min={0}
                max={300}
                value={(component.fadeInDuration.value || 0) / 1000}
                onChange={(value) => {
                  component.fadeInDuration = {
                    case: 'fadeInMs',
                    value: Math.floor(value * 1000),
                  };
                  save(`Set fade in duration for ${component.name}.`);
                }} />
            </div>
            <div className={styles.row}>
              <label>Fade out</label>
              <NumberInput
                type='float'
                title='Fade out seconds'
                min={0}
                max={300}
                value={(component.fadeOutDuration.value || 0) / 1000}
                onChange={(value) => {
                  component.fadeOutDuration = {
                    case: 'fadeOutMs',
                    value: Math.floor(value * 1000),
                  };
                  save(`Set fade out duration for ${component.name}.`);
                }} />
            </div>
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
  const { project, save } = useContext(ProjectContext);

  const device: OutputDescription = useMemo(() => {
    switch (effect.output.case) {
      case 'physicalFixtureId':
        return {
          id: effect.output.value,
          type: 'fixture',
        };
      case 'physicalFixtureGroupId':
        return {
          id: effect.output.value,
          type: 'group',
        };
    }
  }, [effect]);

  return (
    <div className={styles.detailsPane}>
      <div className={styles.effect}>
        <label className={styles.stateHeader}>
          <span>Output</span>
          <OutputSelector
            value={device}
            setValue={(o) => {
              if (o == null) {
                effect.output.case = undefined;
                effect.output.value = undefined;
              } else {
                switch (o.type) {
                  case 'fixture':
                    effect.output.case = 'physicalFixtureId';
                    break;
                  case 'group':
                    effect.output.case = 'physicalFixtureGroupId';
                    break;
                }
                effect.output.value = o.id;
              }
              save(`Set effect output to ${getOutputName(project, effect.output)}.`);
            }} />
        </label>
        <EffectDetails effect={effect.effect} />
      </div>
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
