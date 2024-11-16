import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import IconBxPlus from '../icons/IconBxPlus';
import { Button, IconButton } from './Button';
import { ProjectContext } from '../contexts/ProjectContext';
import { Scene, Scene_Component, Scene_Component_EffectComponent, Scene_Component_SequenceComponent, Scene_ComponentRow } from '@dmx-controller/proto/scene_pb';

import styles from './ComponentGrid.module.scss';
import { ShortcutContext } from '../contexts/ShortcutContext';
import { Modal } from './Modal';
import { BeatMetadata } from '@dmx-controller/proto/beat_pb';
import { BeatContext } from '../contexts/BeatContext';
import { Effect, Effect_StaticEffect, FixtureState } from '@dmx-controller/proto/effect_pb';
import IconBxGridVertical from '../icons/IconBxGridVertical';
import IconBxsCog from '../icons/IconBxsCog';

interface ComponentGridProps {
  className?: string;
  sceneId: number;
  onSelect: (component: Scene_Component) => void;
}

export function ComponentGrid({
  className,
  sceneId,
  onSelect,
}: ComponentGridProps): JSX.Element {
  const { beat } = useContext(BeatContext);
  const { project, save } = useContext(ProjectContext);
  const { setShortcuts } = useContext(ShortcutContext);

  const [addRowIndex, setAddRowIndex] = useState<number>(null);

  const scene = useMemo(() => project?.scenes[sceneId], [project, sceneId]);

  const toggleComponents = useCallback((shortcut: string) => {
    const components = scene.rows
      .flatMap(r => r.components)
      .filter((c) => c.shortcut === shortcut);
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
      scene.rows
        .flatMap(r => r.components)
        .map(c => c.shortcut)
        .filter(c => c != null && c !== ''));

    return setShortcuts(
      Array.from(shortcuts)
        .map(s => ({
          shortcut: { key: 'Digit' + s },
          action: () => toggleComponents(s),
          description: `Group toggle all components with the "${s}" shortcut.`,
        })));
  }, [scene?.rows.flatMap(r => r.components).map(c => c.shortcut)]);

  if (scene == null) {
    return <div className={className}></div>;
  }

  const classes = [styles.componentGrid];
  if (className) {
    classes.push(className);
  }

  return (
    <div className={classes.join(' ')}>
      {
        scene.rows.map((r, i) => (
          <ComponentRow
            key={i}
            row={r}
            onSelect={onSelect}
            onAddComponent={() => setAddRowIndex(i)} />
        ))
      }
      <div
        className={styles.rowPlaceholder}
        onClick={() => {
          scene.rows.push(new Scene_ComponentRow());
          save('Add new component row.');
        }}>
        Add new component row
      </div>
      {
        addRowIndex != null &&
        <AddNewDialog
          scene={scene}
          rowIndex={addRowIndex}
          onSelect={onSelect}
          onClose={() => setAddRowIndex(null)} />
      }
    </div>
  );
}

interface ComponentRowProps {
  row: Scene_ComponentRow;
  onSelect: (component: Scene_Component) => void;
  onAddComponent: () => void;
}

function ComponentRow({ row, onSelect, onAddComponent }: ComponentRowProps) {
  const { save } = useContext(ProjectContext);

  return (
    <div className={styles.row}>
      {
        row.components.map((c, i) => (
          <Component
            key={i}
            component={c}
            onSelect={() => onSelect(c)}
            onDelete={() => () => {
              const name = row.components[i].name;
              row.components.splice(i, 1);
              save(`Delete component for ${name}.`);
            }} />
        ))
      }
      <div
        className={styles.componentPlaceholder}
        onClick={onAddComponent}>
        Add new component
      </div>
    </div>
  );
}

interface ComponentProps {
  component: Scene_Component;
  onSelect: () => void;
  onDelete: () => void;
}

function Component({ component, onSelect }: ComponentProps) {
  const { beat } = useContext(BeatContext);
  const { save } = useContext(ProjectContext);

  const classes = [styles.component];
  if (component.transition.case === 'startFadeInMs') {
    classes.push(styles.active);
  }

  return (
    <div
      className={classes.join(' ')}
      onClick={() => {
        if (transitionComponent(component, component.transition.case !== 'startFadeInMs', beat)) {
          save(`${component.transition.case === 'startFadeInMs' ? 'Enable' : 'Disable'} component ${name}.`);
        }
      }}>
      <div className={styles.dragHandle}>
        <IconBxGridVertical />
      </div>
      <div className={styles.title}>
        {component.name}
      </div>
      <IconButton
        className={styles.settings}
        title="Settings"
        onClick={onSelect}>
        <IconBxsCog />
      </IconButton>
    </div>
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
        case: 'durationBeat',
        value: NaN,
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
      title={`Add new component to row ${rowIndex}`}
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
          save(`Add new effect component to row ${rowIndex}.`);
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
          save(`Add new sequence component to row ${rowIndex}.`);
          onClose();
          onSelect(component);
        }}>
        Add Sequence
      </Button>
    </Modal>
  )
}
