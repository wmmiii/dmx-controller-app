import React, { useContext, useEffect, useState } from 'react';
import IconBxBrushAlt from '../icons/IconBxBrush';
import IconBxPlus from '../icons/IconBxPlus';
import IconBxX from '../icons/IconBxX';
import styles from "./LivePage.module.scss";
import { BeatContext, BeatProvider } from '../contexts/BeatContext';
import { Button, IconButton } from '../components/Button';
import { ComponentGrid } from '../components/ComponentGrid';
import { EffectDetails } from '../components/Effect';
import { HorizontalSplitPane } from '../components/SplitPane';
import { LiveBeat } from '../components/LiveBeat';
import { Modal } from '../components/Modal';
import { NumberInput, TextInput, ToggleInput } from '../components/Input';
import { ProjectContext } from '../contexts/ProjectContext';
import { Scene, Scene_Component, Scene_Component_EffectGroupComponent, Scene_Component_EffectGroupComponent_EffectChannel, Scene_Component_SequenceComponent } from '@dmx-controller/proto/scene_pb';
import { SerialContext } from '../contexts/SerialContext';
import { UniverseSequenceEditor } from '../components/UniverseSequenceEditor';
import { getOutputName, OutputSelector } from '../components/OutputSelector';
import { renderSceneToUniverse as renderActiveSceneToUniverse } from '../engine/universe';
import { universeToUint8Array } from '../engine/utils';


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
  const [addRowIndex, setAddRowIndex] = useState<number>(null);
  const { setRenderUniverse, clearRenderUniverse } = useContext(SerialContext);

  const [selected, setSelected] = useState<Scene_Component | null>(null);

  useEffect(() => {
    if (!project) {
      return;
    }

    const render = (frame: number) => universeToUint8Array(
      project,
      renderActiveSceneToUniverse(
        new Date().getTime(),
        beatMetadata,
        frame,
        project,
      ));
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
          onSelect={setSelected}
          setAddRowIndex={setAddRowIndex} />
      </div>
      {
        addRowIndex != null &&
        <AddNewDialog
          scene={project.scenes[0]}
          rowIndex={addRowIndex}
          onSelect={setSelected}
          onClose={() => setAddRowIndex(null)} />
      }
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
  const { project, save } = useContext(ProjectContext);
  const { beat } = useContext(BeatContext);

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
                value={component.oneShot}
                onChange={(value) => {
                  component.oneShot = value;
                  save(`Set  ${component.name} to ${value ? 'one-shot' : 'looping'}.`);
                }}
                labels={{ left: 'Loop', right: 'One-shot' }} />
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
                    component.duration = {
                      case: 'durationBeat',
                      value: 1,
                    }
                  }
                  save(`Set timing type for component ${component.name} to ${value ? 'seconds' : 'beats'}.`);
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
            <Button
              variant="warning"
              onClick={() => {
                let modified = false;
                project.scenes[0].rows.forEach(row => {
                  const index = row.components.indexOf(component);
                  if (index > -1) {
                    row.components.splice(index, 1);
                    modified = true;
                  }
                });
                if (modified) {
                  onClose();
                  save(`Delete component ${component.name}.`);
                }
              }}>
              Delete Component
            </Button>
          </div>
        }
        right={
          component.description.case === 'effectGroup' ?
            <EffectGroupEditor effect={component.description.value} name={component.name} /> :
            <SequenceEditor sequence={component.description.value} />
        } />
    </Modal>
  );
}

interface EffectGroupEditorProps {
  effect: Scene_Component_EffectGroupComponent;
  name: string;
}

function EffectGroupEditor({ effect, name }: EffectGroupEditorProps) {
  const { project, save } = useContext(ProjectContext);

  return (
    <div className={`${styles.detailsPane} ${styles.effectGroup}`}>
      {
        effect.channels.map((c, i) => (
          <div key={i} className={styles.effect}>
            <IconButton
              className={styles.deleteEffect}
              title="Delete Channel"
              onClick={() => {
                effect.channels.splice(i, 1);
                save(`Delete channel from ${name}`)
              }}>
              <IconBxX />
            </IconButton>
            <label className={styles.stateHeader}>
              <span>Output</span>
              <OutputSelector
                value={c.outputId}
                setValue={(o) => {
                  c.outputId = o;
                  save(`Set effect output to ${getOutputName(project, o)}.`);
                }} />
            </label>
            <EffectDetails effect={c.effect} showTiming={false} />
          </div>
        ))
      }
      <div className={styles.newEffect}>
        <IconButton
          title="Add Effect"
          onClick={() => {
            effect.channels.push(createEffectChannel());
            save('Add channel to effect.')
          }}>
          <IconBxPlus />
        </IconButton>
      </div>
    </div>
  );
}

interface AddNewDialogProps {
  scene: Scene;
  rowIndex: number;
  onSelect: (component: Scene_Component) => void;
  onClose: () => void;
}

function AddNewDialog({ scene, rowIndex, onSelect, onClose }: AddNewDialogProps) {
  const { save } = useContext(ProjectContext);

  const addComponent = (description: Scene_Component['description']) => {
    const component = new Scene_Component({
      name: 'New Component',
      description: description,
      duration: {
        case: 'durationMs',
        value: 1000,
      },
      transition: {
        case: 'startFadeOutMs',
        value: 0n,
      },
    });
    scene.rows[rowIndex].components.push(component);
    return component;
  }
  return (
    <Modal
      bodyClass={styles.addComponent}
      title={`Add new component to row ${rowIndex + 1}`}
      onClose={onClose}>
      <div className={styles.addComponentDescription}>
        Static effects simply set a fixture or group of fixtures to a specific
        state. They do not change over time.
      </div>
      <Button
        icon={<IconBxPlus />}
        onClick={() => {
          const component = addComponent({
            case: 'effectGroup',
            value: new Scene_Component_EffectGroupComponent({
              channels: [createEffectChannel()],
            }),
          });
          save(`Add new effect component to row ${rowIndex}.`);
          onClose();
          onSelect(component);
        }}>
        Add Static Effect
      </Button>
      <div className={styles.addComponentDescription}>
        Sequences can change over time and loop over a specified duration. They
        may control multiple fixtures and groups.
      </div>
      <Button
        icon={<IconBxPlus />}
        onClick={() => {
          const component = addComponent({
            case: 'sequence',
            value: new Scene_Component_SequenceComponent({
              nativeBeats: 1,
            }),
          });
          save(`Add new sequence component to row ${rowIndex}.`);
          onClose();
          onSelect(component);
        }}>
        Add Sequence
      </Button>
    </Modal>
  )
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

function createEffectChannel() {
  return new Scene_Component_EffectGroupComponent_EffectChannel({
    effect: {
      effect: {
        case: 'staticEffect',
        value: {
          state: {},
        },
      },
      startMs: 0,
      endMs: 4_294_967_295,
    },
    outputId: {
      output: {
        case: undefined,
        value: undefined,
      },
    },
  });
}
