import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import styles from './ComponentGrid.module.scss';
import { BeatContext } from '../contexts/BeatContext';
import { BeatMetadata } from '@dmx-controller/proto/beat_pb';
import { ProjectContext } from '../contexts/ProjectContext';
import { Scene_Component, Scene_ComponentMap } from '@dmx-controller/proto/scene_pb';
import { ShortcutContext } from '../contexts/ShortcutContext';
import { TimeContext } from '../contexts/TimeContext';
import { componentActive, componentTileDetails } from '../util/projectUtils';
import { PaletteContext } from '../contexts/PaletteContext';
import { Color, ColorPalette, PaletteColor } from '@dmx-controller/proto/color_pb';
import { FixtureState } from '@dmx-controller/proto/effect_pb';

interface ComponentGridProps {
  className?: string;
  sceneId: number;
  onSelect: (component: Scene_ComponentMap) => void;
  setAddComponentIndex: (index: { x: number, y: number }) => void;
  maxX: number;
  maxY: number;
}

export function ComponentGrid({
  className,
  sceneId,
  onSelect,
  setAddComponentIndex,
  maxX,
  maxY,
}: ComponentGridProps): JSX.Element {
  const { beat } = useContext(BeatContext);
  const { project, save, update } = useContext(ProjectContext);
  const { setShortcuts } = useContext(ShortcutContext);
  const [draggingComponent, setDraggingComponent] = useState<Scene_ComponentMap | null>(null);

  const scene = useMemo(() => project?.scenes[sceneId], [project, sceneId]);

  const toggleComponents = useCallback((shortcut: string) => {
    const components = scene.componentMap
      .map(c => c.component!)
      .filter((c) => c.shortcut === shortcut);
    if (components.find(c => !c.oneShot && c.transition.case === 'startFadeInMs')) {
      components.forEach(c => transitionComponent(c, false, beat));
    } else {
      components.forEach(c => transitionComponent(c, true, beat));
    }
    save(`Toggle components with shortcut "${shortcut}".`);
  }, [scene, save]);

  // Setup shortcuts.
  useEffect(() => {
    if (scene == null) {
      return;
    }

    const shortcuts = new Set(
      scene.componentMap
        .map(c => c.component!)
        .map(c => c.shortcut)
        .filter(s => s != null && s !== ''));

    return setShortcuts(
      Array.from(shortcuts)
        .map(s => ({
          shortcut: { key: 'Digit' + s },
          action: () => toggleComponents(s),
          description: `Group toggle all components with the "${s}" shortcut.`,
        })));
  }, [scene?.componentMap.map(c => c.component! || []).map(c => c.shortcut)]);

  if (scene == null) {
    return <div className={className}></div>;
  }

  const map: Array<Array<Scene_ComponentMap | null>> = [];
  for (let y = 0; y < maxY; y++) {
    map[y] = [];
    for (let x = 0; x < maxX; x++) {
      const c = scene.componentMap.find((c) => c.x === x && c.y === y);
      map[y][x] = c || null;
    }
  }

  const classes = [styles.componentGrid];
  if (className) {
    classes.push(className);
  }

  return (
    <div className={classes.join(' ')}>
      {
        map.map((r, y) => r.map((mapping, x) => {
          if (mapping != null) {
            return (
              <Component
                key={x + ' ' + y}
                component={mapping.component!}
                dragging={mapping === draggingComponent}
                onDragComponent={() => setDraggingComponent(mapping)}
                onDropComponent={() => {
                  if (draggingComponent) {
                    save(`Rearrange components in scene ${scene.name}.`);
                  }
                  setDraggingComponent(null);
                }}
                onSelect={() => onSelect(mapping)}
                x={x}
                y={y}
                priority={mapping.priority} />
            );
          } else {
            return (
              <div
                key={x + ' ' + y}
                className={styles.componentPlaceholder}
                style={{
                  gridColumnStart: x + 1,
                  gridColumnEnd: x + 2,
                  gridRowStart: y + 1,
                  gridRowEnd: y + 2,
                }}
                onClick={() => setAddComponentIndex({ x, y })}
                onDragOver={(e) => {
                  if (draggingComponent) {
                    draggingComponent.x = x;
                    draggingComponent.y = y;
                    update();
                  }
                  e.stopPropagation();
                  e.preventDefault();
                }}>
              </div>
            );
          }
        }))
      }
    </div>
  );
}

interface ComponentProps {
  component: Scene_Component;
  dragging: boolean;
  onDragComponent: () => void;
  onDropComponent: () => void;
  onSelect: () => void;
  x: number;
  y: number;
  priority: number;
}

function Component({ component, dragging, onDragComponent, onDropComponent, onSelect, x, y, priority }: ComponentProps) {
  const { beat } = useContext(BeatContext);
  const { palette } = useContext(PaletteContext);
  const { save } = useContext(ProjectContext);
  const { t } = useContext(TimeContext);

  const details = useMemo(() => componentTileDetails(component), [component.toJson()]);

  const background = useMemo(() => {
    if (details.colors.length === 0) {
      return null;
    } else if (details.colors.length === 1) {
      return complexColorToHex(details.colors[0], palette);
    }

    let gradient = "linear-gradient(135deg, ";
    for (let i = 0; i < details.colors.length; i++) {
      const color = complexColorToHex(details.colors[i], palette);

      gradient += i === 0 ? "" : ", ";
      if (color != null) {
        gradient += color;
      } else {
        gradient += "transparent";
      }
    }
    return gradient + ")";
  }, [details, palette]);

  const classes = [styles.component];
  if (componentActive(component, beat, t)) {
    classes.push(styles.active);
  }
  if (dragging) {
    classes.push(styles.dragging);
  }

  return (
    <div
      className={classes.join(' ')}
      style={{
        gridColumnStart: x + 1,
        gridColumnEnd: x + 2,
        gridRowStart: y + 1,
        gridRowEnd: y + 2,
      }}
      onClick={() => {
        if (transitionComponent(component, component.oneShot || component.transition.case !== 'startFadeInMs', beat)) {
          save(`${component.transition.case === 'startFadeInMs' ? 'Enable' : 'Disable'} component ${component.name}.`);
        }
      }}
      draggable={true}
      onDragStart={(e) => {
        onDragComponent();
        e.stopPropagation();
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        onDropComponent();
        e.stopPropagation();
      }}>
      <div
        className={styles.settingsTriangle}
        onClick={(e) => {
          onSelect();
          e.stopPropagation();
        }}>
      </div>
      <div className={styles.title} style={{ background: background as any }}>
        {component.name}
      </div>
      {
        priority != 0 &&
        <div className={styles.priority}>
          {priority}
        </div>
      }
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

function complexColorToHex(complexColor: FixtureState['lightColor'], palette: ColorPalette) {
  let color: Color | null = null;

  if (complexColor.case === 'color') {
    color = complexColor.value;
  } else if (complexColor.case === 'paletteColor') {
    if (complexColor.value === PaletteColor.PALETTE_PRIMARY) {
      color = palette.primary?.color || null;
    } else if (complexColor.value === PaletteColor.PALETTE_SECONDARY) {
      color = palette.secondary?.color || null;
    } else if (complexColor.value === PaletteColor.PALETTE_TERTIARY) {
      color = palette.tertiary?.color || null;
    } else if (complexColor.value === PaletteColor.PALETTE_WHITE) {
      color = new Color({ red: 0, green: 0, blue: 0, white: 1 });
    } else if (complexColor.value === PaletteColor.PALETTE_BLACK) {
      color = new Color({ red: 0, green: 0, blue: 0, white: 0 });
    }
  }

  if (color == null) {
    return null;
  }

  return rgbwToHex(color.red, color.green, color.blue, color.white || 0);
}

function rgbwToHex(r: number, g: number, b: number, w: number) {
  r = Math.min((r + w) * 255, 255);
  g = Math.min((g + w) * 255, 255);
  b = Math.min((b + w) * 255, 255);
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
