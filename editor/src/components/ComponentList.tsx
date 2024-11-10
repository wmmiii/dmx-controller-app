import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import IconBxPlus from '../icons/IconBxPlus';
import { Button, IconButton } from './Button';
import { ProjectContext } from '../contexts/ProjectContext';
import { Scene, Scene_Component, Scene_Component_EffectComponent, Scene_Component_SequenceComponent } from '@dmx-controller/proto/scene_pb';
import { NumberInput, ToggleInput } from './Input';

import styles from './ComponentList.module.scss';
import { ShortcutContext } from '../contexts/ShortcutContext';
import { Modal } from './Modal';
import IconBxPause from '../icons/IconBxPause';
import IconBxPlay from '../icons/IconBxPlay';
import IconBxGridVertical from '../icons/IconBxGridVertical';
import IconBxX from '../icons/IconBxX';
import IconBxWrench from '../icons/IconBxWrench';
import { BeatMetadata } from '@dmx-controller/proto/beat_pb';
import { BeatContext } from '../contexts/BeatContext';
import { Effect, Effect_StaticEffect, FixtureState } from '@dmx-controller/proto/effect_pb';

interface ComponentList {
  className?: string;
  sceneId: number;
  onSelect: (component: Scene_Component) => void;
}

export function ComponentList({
  className,
  sceneId,
  onSelect,
}: ComponentList): JSX.Element {
  const { beat } = useContext(BeatContext);
  const { project, save } = useContext(ProjectContext);
  const { setShortcuts } = useContext(ShortcutContext);

  const [showAddDialog, setShowAddDialog] = useState(false);
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
    if (scene == null) {
      return;
    }

    const shortcuts = new Set(
      scene.components.map(c => c.shortcut).filter(c => c != null && c !== ''));

    return setShortcuts(
      Array.from(shortcuts)
        .map(s => ({
          shortcut: { key: 'Digit' + s },
          action: () => toggleComponents(s),
          description: `Group toggle all components with the "${s}" shortcut.`,
        })));
  }, [scene?.components.map(c => c.shortcut)]);

  const onDragOver = (newIndex: number) => {
    const originalIndex = scene.components.indexOf(draggingComponent);
    if (originalIndex !== newIndex) {
      scene.components.splice(originalIndex, 1);
      scene.components.splice(newIndex, 0, draggingComponent);
      save('Rearrange components.');
    }
  }

  const classes = [styles.componentList, className];

  if (scene == null) {
    return <></>;
  }

  return (
    <>
      <table className={classes.join(' ')}>
        <thead>
          <tr>
            <th></th>
            <th></th>
            <th colSpan={2}>Sequence</th>
            <th>Key</th>
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
                  onSelect={() => onSelect(scene.components[i])}
                  onDelete={() => {
                    const name = scene.components[i].name;
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
                onClick={() => setShowAddDialog(true)}>
                Add Component
              </Button>
            </td>
          </tr>
        </tbody>
      </table>
      {
        showAddDialog &&
        <AddNewDialog
          scene={scene}
          onSelect={onSelect}
          onClose={() => setShowAddDialog(false)} />
      }
    </>
  );
}

interface ComponentProps {
  component: Scene_Component;
  onSelect: () => void;
  onDelete: () => void;
  onDragStart: () => void;
}

function Component({ component, onSelect, onDelete, onDragStart }: ComponentProps) {
  const { beat } = useContext(BeatContext);
  const { save } = useContext(ProjectContext);

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
            `Disable ${component.name}` :
            `Enable ${component.name}`
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
        {component.name}
      </td>
      <td>
        <IconButton
          title="Component editor"
          onClick={onSelect}>
          <IconBxWrench />
        </IconButton>
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

interface AddNewDialogProps {
  scene: Scene;
  onSelect: (component: Scene_Component) => void;
  onClose: () => void;
}

function AddNewDialog({ scene, onSelect, onClose }: AddNewDialogProps) {
  const { save } = useContext(ProjectContext);

  const addComponent = (description: Scene_Component['description']) => {
    const component = new Scene_Component({
      name: 'New Component',
      description: description,
      duration: {
        case: 'durationBeat',
        value: NaN,
      },
      transition: {
        case: 'startFadeOutMs',
        value: 0n,
      },
    });
    scene.components.push(component);
    return component;
  }
  return (
    <Modal
      title="Add new component"
      onClose={onClose}>
      <Button
        icon={<IconBxPlus />}
        onClick={() => {
          const component = addComponent({
            case: 'effect',
            value: new Scene_Component_EffectComponent({
              effect: new Effect({
                effect: {
                  case: 'staticEffect',
                  value: new Effect_StaticEffect({
                    effect: {
                      case: 'state',
                      value: new FixtureState(),
                    }
                  }),
                },
              }),
            }),
          });
          save('Add new effect component.');
          onClose();
          onSelect(component);
        }}>
        Add Effect
      </Button>
      <Button
        icon={<IconBxPlus />}
        onClick={() => {
          const component = addComponent({
            case: 'sequence',
            value: new Scene_Component_SequenceComponent({
              nativeBeats: 1,
            }),
          });
          save('Add new effect component.');
          onClose();
          onSelect(component);
        }}>
        Add Sequence
      </Button>
    </Modal>
  )
}
