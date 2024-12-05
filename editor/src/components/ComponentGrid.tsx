import React, { DragEventHandler, ReactEventHandler, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import IconBxArrowToRight from '../icons/IconBxArrowToRight';
import IconBxCategory from '../icons/IconBxCategory';
import IconBxCheckbox from '../icons/IconBxCheckbox';
import IconBxGridVertical from '../icons/IconBxGridVertical';
import IconBxPlus from '../icons/IconBxPlus';
import IconBxPulse from '../icons/IconBxPulse';
import IconBxRightArrowAlt from '../icons/IconBxRightArrowAlt';
import IconBxTimeFive from '../icons/IconBxTimeFive';
import IconBxsCog from '../icons/IconBxsCog';
import styles from './ComponentGrid.module.scss';
import { BeatContext } from '../contexts/BeatContext';
import { BeatMetadata } from '@dmx-controller/proto/beat_pb';
import { IconButton } from './Button';
import { ProjectContext } from '../contexts/ProjectContext';
import { Scene_Component, Scene_ComponentRow } from '@dmx-controller/proto/scene_pb';
import { ShortcutContext } from '../contexts/ShortcutContext';
import { TimeContext } from '../contexts/TimeContext';
import { componentActive } from '../util/projectUtils';

interface ComponentGridProps {
  className?: string;
  sceneId: number;
  onSelect: (component: Scene_Component) => void;
  setAddRowIndex: (index: number) => void;
}

export function ComponentGrid({
  className,
  sceneId,
  onSelect,
  setAddRowIndex,
}: ComponentGridProps): JSX.Element {
  const { beat } = useContext(BeatContext);
  const { project, save, update } = useContext(ProjectContext);
  const { setShortcuts } = useContext(ShortcutContext);
  const [draggingRow, setDraggingRow] = useState<Scene_ComponentRow | null>(null);
  const [draggingComponent, setDraggingComponent] = useState<Scene_Component | null>(null);

  const scene = useMemo(() => project?.scenes[sceneId], [project, sceneId]);

  const toggleComponents = useCallback((shortcut: string) => {
    const components = scene.rows
      .flatMap(r => r.components)
      .filter((c) => c.shortcut === shortcut);
    if (components.find(c => !c.oneShot && c.transition.case === 'startFadeInMs')) {
      components.forEach(c => transitionComponent(c, false, beat));
    } else {
      components.forEach(c => transitionComponent(c, true, beat));
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
            draggingComponent={draggingComponent}
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
    </div>
  );
}

interface ComponentRowProps {
  row: Scene_ComponentRow;
  dragging: boolean;
  onDragRow: (row: Scene_ComponentRow) => void;
  onDragRowOver: () => void;
  onDropRow: () => void;
  draggingComponent: Scene_Component | undefined;
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
  draggingComponent,
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
            dragging={c === draggingComponent}
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
        <div className={styles.icon}>
          <IconBxPlus />
        </div>
        <div className={styles.iconPlaceholder}></div>
        <div className={styles.iconPlaceholder}></div>
        <div className={styles.settingsPlaceholder}></div>
        <div className={styles.title}>
          Add new component
        </div>
      </div>
    </div>
  );
}

interface ComponentProps {
  component: Scene_Component;
  dragging: boolean;
  onDragComponent: (component: Scene_Component) => void;
  onDragComponentOver: () => void;
  onDropComponent: () => void;
  onSelect: () => void;
  onDelete: () => void;
}

function Component({ component, dragging, onDragComponent, onDragComponentOver, onDropComponent, onSelect }: ComponentProps) {
  const { beat } = useContext(BeatContext);
  const { t } = useContext(TimeContext);
  const { save } = useContext(ProjectContext);

  const classes = [styles.component];
  if (componentActive(component, beat, t)) {
    classes.push(styles.active);
  }
  if (dragging) {
    classes.push(styles.dragging);
  }

  const drop = (e: any) => {
    onDropComponent();
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      className={classes.join(' ')}
      onClick={() => {
        if (transitionComponent(component, component.oneShot || component.transition.case !== 'startFadeInMs', beat)) {
          save(`${component.transition.case === 'startFadeInMs' ? 'Enable' : 'Disable'} component ${component.name}.`);
        }
      }}
      draggable={true}
      onDragStart={(e) => {
        onDragComponent(component);
        e.stopPropagation();
      }}
      onDragOver={(e) => {
        onDragComponentOver();
        e.stopPropagation();
        e.preventDefault();
      }}
      onDrop={drop}
      onMouseUp={drop}>
      <div
        className={styles.icon}
        title={component.oneShot ? 'One-shot' : 'Loop'}>
        {
          component.oneShot ?
            <IconBxArrowToRight /> :
            <IconBxRightArrowAlt />
        }
      </div>
      <div
        className={styles.icon}
        title={component.description.case === 'effectGroup' ? 'Effect' : 'Sequence'}>
        {
          component.description.case === 'effectGroup' ?
            <IconBxCheckbox /> :
            <IconBxCategory />
        }
      </div>
      <div
        className={styles.icon}
        title={component.duration.case === 'durationBeat' ? 'Beat' : 'Fixed timing'}>
        {
          component.duration.case === 'durationBeat' ?
            <IconBxPulse /> :
            <IconBxTimeFive />
        }
      </div>
      <IconButton
        className={styles.settings}
        title="Settings"
        onClick={onSelect}>
        <IconBxsCog />
      </IconButton>
      <div className={styles.title}>
        {component.name}
      </div>
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

  // One shot components should always restart now.
  if (enabled && component.oneShot) {
    component.transition = {
      case: 'startFadeInMs',
      value: t,
    };
    return true;
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

