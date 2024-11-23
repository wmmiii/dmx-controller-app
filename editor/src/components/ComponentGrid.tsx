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
  const { project, save, update } = useContext(ProjectContext);
  const { setShortcuts } = useContext(ShortcutContext);
  const [draggingRow, setDraggingRow] = useState<Scene_ComponentRow | null>(null);
  const [draggingComponent, setDraggingComponent] = useState<Scene_Component | null>(null);

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

  const dragOverRow = useCallback((dropIndex: number) => {
    const draggingIndex = scene.rows.indexOf(draggingRow);
    if (draggingIndex < 0) {
      return;
    } else if (draggingIndex === dropIndex) {
      return;
    }
    scene.rows.splice(draggingIndex, 1);
    scene.rows.splice(dropIndex, 0, draggingRow);
    update();
  }, [scene, draggingRow]);

  const onDropRow = useCallback(() => {
    setDraggingRow(null);
    save(`Reorder rows in scene ${scene.name}.`);
  }, [save]);

  const dragComponentOver = useCallback((dropRow: number, dropIndex: number) => {
    let draggingRow: number;
    let draggingIndex: number;
    for (const rowIndex in scene.rows) {
      const row = scene.rows[rowIndex];
      const index = row.components.indexOf(draggingComponent);
      if (index > -1) {
        draggingRow = parseInt(rowIndex);
        draggingIndex = index;
        break;
      }
    }
    if (draggingRow == null || draggingIndex == null) {
      return;
    } else if (draggingRow === dropRow && draggingIndex === dropIndex) {
      return;
    }
    scene.rows[draggingRow].components.splice(draggingIndex, 1);
    scene.rows[dropRow].components.splice(dropIndex, 0, draggingComponent);
    scene.rows[dropRow].components = scene.rows[dropRow].components.filter((c) => c != null);
    update();
  }, [draggingComponent, update]);

  const onDropComponent = useCallback(() => {
    setDraggingComponent(null);
    save(`Rearrange components in scene ${scene.name}.`);
  }, [save]);

  // Setup shortcuts.
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
  }, [scene?.rows.flatMap(r => r?.components || []).map(c => c.shortcut)]);

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
            dragging={draggingRow === r}
            onDragRow={setDraggingRow}
            onDragRowOver={() => dragOverRow(i)}
            onDropRow={onDropRow}
            onDragComponent={setDraggingComponent}
            onDragComponentOver={(index: number) => dragComponentOver(i, index)}
            onDropComponent={onDropComponent}
            onAddComponent={() => setAddRowIndex(i)} />
        ))
      }
      <div
        className={styles.rowPlaceholder}
        onClick={() => {
          scene.rows.push(new Scene_ComponentRow());
          save('Add new component row.');
        }}
        onDragOver={(e) => {
          if (draggingComponent) {
            scene.rows.push(new Scene_ComponentRow());
            update();
          }
          e.stopPropagation();
          e.preventDefault();
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
  dragging: boolean;
  onDragRow: (row: Scene_ComponentRow) => void;
  onDragRowOver: () => void;
  onDropRow: () => void;
  onDragComponent: (component: Scene_Component) => void;
  onDragComponentOver: (index: number) => void;
  onDropComponent: () => void;
  onSelect: (component: Scene_Component) => void;
  onAddComponent: () => void;
}

function ComponentRow({
  row,
  dragging,
  onDragRow,
  onDragRowOver,
  onDropRow,
  onDragComponent,
  onDragComponentOver,
  onDropComponent,
  onSelect,
  onAddComponent,
}: ComponentRowProps) {
  const { save } = useContext(ProjectContext);

  return (
    <div
      className={styles.row}
      draggable={dragging}
      onDragOver={(e) => {
        onDragRowOver();
        e.stopPropagation();
        e.preventDefault();
      }}
      onDragEnd={(e) => {
        onDropRow();
        e.preventDefault();
        e.stopPropagation();
      }}>
      <div className={styles.dragHandle} onMouseDown={() => onDragRow(row)}>
        <IconBxGridVertical />
      </div>
      {
        row.components.map((c, i) => (
          <Component
            key={i}
            component={c}
            onDragComponent={onDragComponent}
            onDragComponentOver={() => onDragComponentOver(i)}
            onDropComponent={onDropComponent}
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
        onClick={onAddComponent}
        onDragOver={(e) => {
          onDragComponentOver(row.components.length)
          e.stopPropagation();
          e.preventDefault();
        }}>
        Add new component
      </div>
    </div>
  );
}

interface ComponentProps {
  component: Scene_Component;
  onDragComponent: (component: Scene_Component) => void;
  onDragComponentOver: () => void;
  onDropComponent: () => void;
  onSelect: () => void;
  onDelete: () => void;
}

function Component({ component, onDragComponent, onDragComponentOver, onDropComponent, onSelect }: ComponentProps) {
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
      }}
      draggable={true}
      onDragOver={(e) => {
        onDragComponentOver();
        e.stopPropagation();
        e.preventDefault();
      }}
      onDragEnd={(e) => {
        onDropComponent();
        e.preventDefault();
        e.stopPropagation();
      }}>
      <div className={styles.dragHandle} onMouseDown={() => onDragComponent(component)}>
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
            case: 'effect',
            value: new Scene_Component_EffectComponent({
              effect: {
                effect: {
                  case: 'staticEffect',
                  value: {
                    effect: {
                      case: 'state',
                      value: {},
                    }
                  },
                },
              },
              outputId: {
                output: {
                  case: undefined,
                  value: undefined,
                },
              },
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
