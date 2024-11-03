import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import IconBxPlus from '../icons/IconBxPlus';
import { Button, IconButton } from './Button';
import { ProjectContext } from '../contexts/ProjectContext';
import { Scene_Component } from '@dmx-controller/proto/scene_pb';
import { NumberInput, TextInput, ToggleInput } from './Input';

import styles from './SceneEditor.module.scss';
import { ShortcutContext } from '../contexts/ShortcutContext';
import { LiveBeat } from './LiveBeat';
import { Modal } from './Modal';
import IconBxPause from '../icons/IconBxPause';
import IconBxPlay from '../icons/IconBxPlay';
import IconBxGridVertical from '../icons/IconBxGridVertical';
import IconBxX from '../icons/IconBxX';
import IconBxWrench from '../icons/IconBxWrench';
import { UniverseSequenceEditor } from './UniverseSequenceEditor';
import { BeatMetadata } from '@dmx-controller/proto/beat_pb';
import { BeatContext } from '../contexts/BeatContext';

interface SceneEditorProps {
  className?: string;
  sceneId: number;
  onDelete: () => void;
}

export function SceneEditor({
  className,
  sceneId,
  onDelete,
}: SceneEditorProps): JSX.Element {
  const { beat } = useContext(BeatContext);
  const { project, save } = useContext(ProjectContext);
  const { setShortcuts } = useContext(ShortcutContext);

  const [sceneDetailsModal, setSceneDetailsModal] = useState(false);
  const [draggingComponent, setDraggingComponent] = useState<Scene_Component | null>(null);

  const scene = useMemo(() => project?.scenes[sceneId], [project, sceneId]);

  const toggleComponents = useCallback((shortcut: string) => {
    const components = scene.components.filter((c) => c.shortcut === shortcut);
    if (components.find(c => c.transition.case !== 'startFadeInMs')) {
      components.forEach(c => transitionComponent(c, true, beat));
    } else {
      components.forEach(c => transitionComponent(c, false, beat));
    }
    save(`Toggle components with shortcut "${shortcut}".`);
  }, [scene, save]);

  useEffect(() => {
    const shortcuts = new Set(
      scene.components.map(c => c.shortcut).filter(c => c != null && c !== ''));

    return setShortcuts(
      Array.from(shortcuts)
        .map(s => ({
          shortcut: { key: 'Digit' + s },
          action: () => toggleComponents(s),
          description: `Group toggle all components with the "${s}" shortcut.`,
        })));
  }, [scene.components.map(c => c.shortcut)]);

  const onDragOver = (newIndex: number) => {
    const originalIndex = scene.components.indexOf(draggingComponent);
    if (originalIndex !== newIndex) {
      scene.components.splice(originalIndex, 1);
      scene.components.splice(newIndex, 0, draggingComponent);
      save('Rearrange components.');
    }
  }

  const classes = [styles.sceneEditor, className];

  return (
    <div className={classes.join(' ')}>
      <div className={styles.header}>
        <Button
          className={styles.activateButton}
          disabled={project.activeScene === sceneId}
          onClick={() => {
            project.activeScene = sceneId;
            save(`Activate scene ${project.scenes[sceneId].name}.`);
          }}>
          {project.activeScene === sceneId ? 'Active' : 'Activate'}
        </Button>
        <Button onClick={() => setSceneDetailsModal(true)}>
          Scene Details
        </Button>
        <LiveBeat />
      </div>
      <div className={styles.componentListWrapper}>
        <table className={styles.componentList}>
          <thead>
            <tr>
              <th></th>
              <th></th>
              <th colSpan={2}>Sequence</th>
              <th>Shortcut</th>
              <th>Loop duration</th>
              <th>Fade in</th>
              <th>Fade out</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {
              scene.components.map((c, i) => (
                <tr
                  key={i}
                  draggable={draggingComponent === c}
                  onDragOver={() => onDragOver(i)}>
                  <Component
                    component={c}
                    onDelete={() => {
                      const name = project.universeSequences[scene.components[i].universeSequenceId]?.name || '<Unset>';
                      scene.components.splice(i, 1);
                      save(`Delete component for ${name}.`);
                    }}
                    onDragStart={() => setDraggingComponent(c)} />
                </tr>
              ))
            }
            <tr>
              <td></td>
              <td colSpan={2}>
                <Button
                  icon={<IconBxPlus />}
                  onClick={() => {
                    scene.components.push(new Scene_Component({
                      universeSequenceId: 0,
                      transition: {
                        case: 'startFadeOutMs',
                        value: 0n,
                      }
                    }));
                    save('Create new component.');
                  }}>
                  Add Component
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {
        sceneDetailsModal &&
        <Modal
          title={`${scene.name} Details`}
          footer={
            <Button
              variant="primary"
              onClick={() => setSceneDetailsModal(false)}>
              Done
            </Button>
          }
          onClose={() => setSceneDetailsModal(false)}>
          <TextInput
            value={scene.name}
            onChange={(v) => {
              scene.name = v;
              save(`Update scene name to "${v}".`);
            }} />
          <Button
            variant="warning"
            onClick={onDelete}>
            Delete Scene
          </Button>
        </Modal>
      }
    </div>
  );
}

interface ComponentProps {
  component: Scene_Component;
  onDelete: () => void;
  onDragStart: () => void;
}

function Component({ component, onDelete, onDragStart }: ComponentProps) {
  const { beat } = useContext(BeatContext);
  const { save, project } = useContext(ProjectContext);

  const [showSequenceEditor, setShowSequenceEditor] = useState(false);

  const name = project.universeSequences[component.universeSequenceId]?.name || '<Unset>';

  return (
    <>
      <td className={styles.rearrange}>
        <div
          className={styles.dragHandle}
          onMouseDown={onDragStart}>
          <IconBxGridVertical />
        </div>
      </td>
      <td>
        <IconButton
          title={component.transition.case === 'startFadeInMs' ?
            `Disable ${project.universeSequences[component.universeSequenceId]?.name}` :
            `Enable ${project.universeSequences[component.universeSequenceId]?.name}`
          }
          variant={component.transition.case === 'startFadeInMs' ? 'primary' : 'default'}
          onClick={() => {
            if (transitionComponent(component, component.transition.case !== 'startFadeInMs', beat)) {
              save(`${component.transition.case === 'startFadeInMs' ? 'Enable' : 'Disable'} component ${name}.`);
            }
          }}>
          {
            component.transition.case === 'startFadeInMs' ?
              <IconBxPause /> :
              <IconBxPlay />
          }
        </IconButton>
      </td>
      <td>
        <select
          value={component.universeSequenceId}
          onChange={(e) => {
            component.universeSequenceId = parseInt(e.target.value);
            const name = project.universeSequences[component.universeSequenceId].name;
            save(`Set component to ${name}.`);
          }}>
          <option value={0}>&lt;Unset&gt;</option>
          {
            Object.keys(project.universeSequences)
              .map(id => {
                const sequence = project.universeSequences[parseInt(id)];
                return (
                  <option key={id} value={id}>{sequence.name}</option>
                );
              })
          }
        </select>
      </td>
      <td>
        <IconButton
          title="Show editor"
          onClick={() => setShowSequenceEditor(true)}>
          <IconBxWrench />
        </IconButton>
        {
          showSequenceEditor &&
          <Modal
            bodyClass={styles.universeSequenceEditor}
            title={`Edit ${project.universeSequences[component.universeSequenceId].name}`}
            onClose={() => setShowSequenceEditor(false)}
            fullScreen={true}>
            <UniverseSequenceEditor universeSequenceId={component.universeSequenceId} />
          </Modal>
        }
      </td>
      <td>
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
      </td>
      <td>
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
        <NumberInput
          type='float'
          min={0.001}
          max={300}
          value={component.duration?.value / 1000 || NaN}
          onChange={(value) => {
            component.duration.value = Math.floor(value * 1000);
            save(`Set duration for component ${name}.`);
          }}
          disabled={component.duration?.case !== 'durationMs'} />
      </td>
      <td>
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
            save(`Set fade in duration for ${name}.`);
          }} />
      </td>
      <td>
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
            save(`Set fade out duration for ${name}.`);
          }} />
      </td>
      <td>
        <IconButton
          title="Delete Component"
          onClick={onDelete}>
          <IconBxX />
        </IconButton>
      </td>
    </>
  );
}

function transitionComponent(component: Scene_Component, enabled: boolean, beat: BeatMetadata) {
  const t = BigInt(new Date().getTime());
  if (component.transition.case === undefined) {
    component.transition = {
      case: 'startFadeOutMs',
      value: 0n,
    };
  }

  const fadeInMs = component.fadeInDuration.case === 'fadeInBeat' ?
    (component.fadeInDuration.value || 0) * beat.lengthMs :
    (component.fadeInDuration.value || 0);

  const fadeOutMs = component.fadeOutDuration.case === 'fadeOutBeat' ?
    (component.fadeOutDuration.value || 0) * beat.lengthMs :
    (component.fadeOutDuration.value || 0);

  if (!enabled && component.transition.case === 'startFadeInMs') {
    // Calculate fade in amount.
    const amount = Math.min(1, Number(t - component.transition.value) / fadeInMs);

    // Set fade out such that effect is contiguous.
    component.transition = {
      case: 'startFadeOutMs',
      value: t - BigInt(Math.floor((1 - amount) * fadeOutMs)),
    };
    return true;
  } else if (enabled && component.transition.case === 'startFadeOutMs') {
    // Calculate fade out amount.
    const amount = Math.max(0, 1 - (Number(t - component.transition.value) / fadeOutMs));

    // Set fade in such that effect is contiguous.
    component.transition = {
      case: 'startFadeInMs',
      value: t - BigInt(Math.floor(amount * fadeInMs)),
    };
    return true;
  } else {
    return false;
  }
}
