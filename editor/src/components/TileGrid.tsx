import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import styles from './TileGrid.module.scss';
import { BeatContext } from '../contexts/BeatContext';
import { ProjectContext } from '../contexts/ProjectContext';
import { Scene_Tile, Scene_TileMap } from '@dmx-controller/proto/scene_pb';
import { TimeContext } from '../contexts/TimeContext';
import { tileTileDetails } from '../util/projectUtils';
import { PaletteContext } from '../contexts/PaletteContext';
import { Color, ColorPalette, PaletteColor } from '@dmx-controller/proto/color_pb';
import { FixtureState } from '@dmx-controller/proto/effect_pb';
import { ControllerContext } from '../contexts/ControllerContext';
import { SiMidi } from 'react-icons/si';
import { tileActiveAmount, toggleTile } from '../util/tile';
import { findAction } from '../external_controller/externalController';
import { ControllerMapping_TileStrength } from '@dmx-controller/proto/controller_pb';

interface TileGridProps {
  className?: string;
  sceneId: number;
  onSelect: (tile: Scene_TileMap) => void;
  setAddTileIndex: (index: { x: number, y: number }) => void;
  maxX: number;
  maxY: number;
}

export function TileGrid({
  className,
  sceneId,
  onSelect,
  setAddTileIndex: setAddTileIndex,
  maxX,
  maxY,
}: TileGridProps): JSX.Element {
  const { project, save, update } = useContext(ProjectContext);
  const [draggingTile, setDraggingTile] = useState<Scene_TileMap | null>(null);

  const scene = useMemo(() => project?.scenes[sceneId], [project, sceneId]);

  if (scene == null) {
    return <div className={className}></div>;
  }

  const map: Array<Array<Scene_TileMap | null>> = [];
  for (let y = 0; y < maxY; y++) {
    map[y] = [];
    for (let x = 0; x < maxX; x++) {
      const c = scene.tileMap.find((c) => c.x === x && c.y === y);
      map[y][x] = c || null;
    }
  }

  const classes = [styles.tileGrid];
  if (className) {
    classes.push(className);
  }

  return (
    <div className={classes.join(' ')}>
      {
        map.map((r, y) => r.map((mapping, x) => {
          if (mapping != null) {
            return (
              <Tile
                key={x + ' ' + y}
                id={mapping.id}
                tile={mapping.tile!}
                onDragTile={() => setDraggingTile(mapping)}
                onDropTile={() => {
                  if (draggingTile) {
                    save(`Rearrange tiles in scene ${scene.name}.`);
                  }
                  setDraggingTile(null);
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
                className={styles.tilePlaceholder}
                style={{
                  gridColumnStart: x + 1,
                  gridColumnEnd: x + 2,
                  gridRowStart: y + 1,
                  gridRowEnd: y + 2,
                }}
                onClick={() => setAddTileIndex({ x, y })}
                onDragOver={(e) => {
                  if (draggingTile) {
                    draggingTile.x = x;
                    draggingTile.y = y;
                    update();
                  }
                  e.stopPropagation();
                  e.preventDefault();
                }}>
                <div className={styles.contents}></div>
              </div>
            );
          }
        }))
      }
    </div>
  );
}

interface TileProps {
  id: string,
  tile: Scene_Tile;
  onDragTile: () => void;
  onDropTile: () => void;
  onSelect: () => void;
  x: number;
  y: number;
  priority: number;
}

function Tile({ id, tile, onDragTile, onDropTile, onSelect, x, y, priority }: TileProps) {
  const { controllerName } = useContext(ControllerContext);
  const { beat } = useContext(BeatContext);
  const { palette } = useContext(PaletteContext);
  const { project, save } = useContext(ProjectContext);
  const { addListener, removeListener } = useContext(TimeContext);

  const [t, setT] = useState(0n);

  useEffect(() => {
    const listener = (t: bigint) => setT(t);
    addListener(listener);
    return () => removeListener(listener);
  }, [setT, addListener, removeListener]);

  const details = useMemo(() => tileTileDetails(tile), [tile.toJson()]);

  const controllerMapping = useMemo(() => {
    if (controllerName) {
      return findAction(project, controllerName, {
        case: 'tileStrength',
        value: new ControllerMapping_TileStrength({
          scene: 0,
          tileId: id,
        }),
      });
    }
    return undefined;
  }, [project, controllerName]);

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

  const toggle = useCallback(() => {
    const [modified, enabled] = toggleTile(tile, beat)
    if (modified) {
      save(`${enabled ? 'Enable' : 'Disable'} tile ${tile.name}.`);
    }
  }, [tile, beat, save]);

  const activeAmount = tileActiveAmount(tile, beat, t);

  const classes = [styles.tile];

  return (
    <div
      className={classes.join(' ')}
      style={{
        gridColumnStart: x + 1,
        gridColumnEnd: x + 2,
        gridRowStart: y + 1,
        gridRowEnd: y + 2,
      }}
      onClick={toggle}
      draggable={true}
      onDragStart={(e) => {
        onDragTile();
        e.stopPropagation();
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        onDropTile();
        e.stopPropagation();
      }}>
      <div className={styles.contents}>
        <div
          className={styles.settingsTriangle}
          onClick={(e) => {
            onSelect();
            e.stopPropagation();
          }}>
        </div>
        <div className={styles.title} style={{ background: background as any }}>
          {tile.name}
        </div>
        {
          priority != 0 &&
          <div className={styles.priority}>
            {priority}
          </div>
        }
        {
          controllerMapping &&
          <div className={styles.controller}>
            <SiMidi />
          </div>
        }
      </div>
      <div className={styles.border} style={{ opacity: activeAmount }}></div>
    </div>
  );
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
