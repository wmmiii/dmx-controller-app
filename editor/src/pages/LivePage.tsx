import { useContext, useEffect, useRef, useState } from 'react';
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
import { Scene, Scene_Component, Scene_Component_EffectGroupComponent, Scene_Component_EffectGroupComponent_EffectChannel, Scene_Component_SequenceComponent, Scene_ComponentMap } from '@dmx-controller/proto/scene_pb';
import { SerialContext } from '../contexts/SerialContext';
import { UniverseSequenceEditor } from '../components/UniverseSequenceEditor';
import { getOutputName, OutputSelector } from '../components/OutputSelector';
import { DEFAULT_COLOR_PALETTE, renderSceneToUniverse as renderActiveSceneToUniverse } from '../engine/universe';
import { universeToUint8Array } from '../engine/utils';
import { Project } from '@dmx-controller/proto/project_pb';
import { PaletteContext } from '../contexts/PaletteContext';
import { PaletteSwatch } from '../components/Palette';
import { getAvailableChannels } from '../engine/fixture';


export function LivePage(): JSX.Element {
  return (
    <BeatProvider>
      <LivePageImpl />
    </BeatProvider>
  );
}

function LivePageImpl(): JSX.Element {
  const { project, save } = useContext(ProjectContext);
  const projectRef = useRef<Project>(project);
  const { beat: beatMetadata } = useContext(BeatContext);
  const [addComponentIndex, setAddComponentIndex] = useState<{ x: number, y: number } | null>(null);
  const { setRenderUniverse, clearRenderUniverse } = useContext(SerialContext);

  const [selected, setSelected] = useState<Scene_ComponentMap | null>(null);

  const scene = project?.scenes[0];

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    const render = (frame: number) => {
      const project = projectRef.current;
      if (project != null) {
        return universeToUint8Array(
          projectRef.current,
          renderActiveSceneToUniverse(
            new Date().getTime(),
            beatMetadata,
            frame,
            project,
          ));
      } else {
        return new Uint8Array(512);
      }
    };
    setRenderUniverse(render);

    return () => clearRenderUniverse(render);
  }, [beatMetadata, projectRef]);

  return (
    <PaletteContext.Provider value={{
      palette: scene?.colorPalettes[scene.activeColorPalette] || DEFAULT_COLOR_PALETTE
    }}>
      <div className={styles.wrapper}>
        <div className={styles.header}>
          <LiveBeat className={styles.beat} />
        </div>
        <div className={styles.body}>
          <div className={styles.gridWrapper}>
            <ComponentGrid
              className={styles.sceneEditor}
              sceneId={0}
              onSelect={setSelected}
              setAddComponentIndex={setAddComponentIndex}
              maxX={scene.componentMap.map(c => c.x).reduce((a, b) => a > b ? a : b, 0) + 2}
              maxY={scene.componentMap.map(c => c.y).reduce((a, b) => a > b ? a : b, 0) + 2} />
          </div>
          <div className={styles.palettes}>
            {
              scene?.colorPalettes.map((p, i) => (
                <PaletteSwatch
                  key={i}
                  palette={p}
                  active={scene.activeColorPalette === i}
                  onClick={() => {
                    scene.lastActiveColorPalette = scene.activeColorPalette;
                    scene.activeColorPalette = i;
                    scene.colorPaletteStartTransition = BigInt(new Date().getTime());
                    save(`Set color palette to ${p.name}.`);
                  }}
                  onDelete={() => {
                    if (scene.colorPalettes.length <= 1) {
                      return;
                    }

                    scene.activeColorPalette = 0;
                    scene.lastActiveColorPalette = 0;
                    scene.colorPalettes.splice(i, 1);

                    save(`Delete color palette ${p.name}`)
                  }} />
              ))
            }
            <Button
              icon={<IconBxPlus />}
              onClick={() => {
                const newPalette = DEFAULT_COLOR_PALETTE.clone();
                newPalette.name = 'New color palette';
                scene.colorPalettes.push(newPalette);
                save('Add new color palette');
              }}>
              Palette
            </Button>
          </div>
        </div>
      </div>
      {
        addComponentIndex != null &&
        <AddNewDialog
          scene={project.scenes[0]}
          x={addComponentIndex.x}
          y={addComponentIndex.y}
          onSelect={setSelected}
          onClose={() => setAddComponentIndex(null)} />
      }
      {
        selected &&
        <ComponentEditor componentMap={selected} onClose={() => setSelected(null)} />
      }
    </PaletteContext.Provider>
  );
}

interface ComponentEditorProps {
  componentMap: Scene_ComponentMap;
  onClose: () => void;
}

function ComponentEditor({ componentMap, onClose }: ComponentEditorProps) {
  const { project, save } = useContext(ProjectContext);

  const component = componentMap.component!;

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
              <label>Priority</label>
              <NumberInput
                min={-1000}
                max={1000}
                type="integer"
                value={componentMap.priority}
                onChange={(v) => {
                  componentMap.priority = v;
                  save(`Set priority to ${v} for ${component.name}.`);
                }} />
            </div>
            <div className={styles.row}>
              <label>Shortcut</label>
              <input
                onChange={() => { }}
                onKeyDown={(e) => {
                  if (e.code.startsWith('Digit')) {
                    componentMap.shortcut = e.code.substring(5);
                    save(`Add shortcut ${componentMap.shortcut} for component ${component.name}.`);
                  } else if (e.code === 'Backspace' || e.code === 'Delete') {
                    save(`Remove shortcut for component ${component.name}.`);
                  }
                }}
                value={componentMap.shortcut} />
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
                const componentMap = project.scenes[0].componentMap;
                const index = componentMap.findIndex((c) => c.component === component);
                if (index > -1) {
                  componentMap.splice(index, 1);

                  onClose();
                  save(`Delete component ${component.name}.`);
                }
              }}>
              Delete Component
            </Button>
          </div>
        }
        right={<>
          {
            component.description.case === 'effectGroup' &&
            <EffectGroupEditor effect={component.description.value} name={component.name} />
          }
          {
            component.description.case === 'sequence' &&
            <SequenceEditor sequence={component.description.value} />
          }
        </>} />
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
        effect.channels.map((c, i) => {
          if (c.effect == null) {
            throw new Error('Channel effect is not defined!');
          }
          return (
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
              <EffectDetails
                effect={c.effect}
                showTiming={false}
                showPhase={c.outputId?.output.case === 'group'}
                availableChannels={getAvailableChannels(c.outputId, project)}/>
            </div>
          )
        })
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
  x: number;
  y: number;
  onSelect: (componentMap: Scene_ComponentMap) => void;
  onClose: () => void;
}

function AddNewDialog({ scene, x, y, onSelect, onClose }: AddNewDialogProps) {
  const { save } = useContext(ProjectContext);

  const addComponent = (description: Scene_Component['description'], x: number, y: number) => {
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
    const componentMap = new Scene_ComponentMap({
      component: component,
      x: x,
      y: y,
    });
    scene.componentMap.push(componentMap);
    return componentMap;
  }
  return (
    <Modal
      bodyClass={styles.addComponent}
      title={`Add new component`}
      onClose={onClose}>
      <div className={styles.addComponentDescription}>
        Static effects simply set a fixture or group of fixtures to a specific
        state. They do not change over time.
      </div>
      <Button
        icon={<IconBxPlus />}
        onClick={() => {
          const componentMap = addComponent({
            case: 'effectGroup',
            value: new Scene_Component_EffectGroupComponent({
              channels: [createEffectChannel()],
            }),
          }, x, y);
          save(`Add new effect component.`);
          onClose();
          onSelect(componentMap);
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
          }, x, y);
          save(`Add new sequence component.`);
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
