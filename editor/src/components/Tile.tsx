import { create, toJson } from '@bufbuild/protobuf';
import {
  ColorSchema,
  PaletteColor,
  type Color,
  type ColorPalette,
} from '@dmx-controller/proto/color_pb';
import { type FixtureState } from '@dmx-controller/proto/effect_pb';
import {
  Scene_TileSchema,
  type Scene_Tile,
} from '@dmx-controller/proto/scene_pb';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { SiMidi } from 'react-icons/si';

import { BeatContext } from '../contexts/BeatContext';
import { ControllerContext } from '../contexts/ControllerContext';
import { PaletteContext } from '../contexts/PaletteContext';
import { ProjectContext } from '../contexts/ProjectContext';
import { TimeContext } from '../contexts/TimeContext';
import { tileTileDetails } from '../util/projectUtils';
import { tileActiveAmount, toggleTile } from '../util/tile';

import { ControllerMapping_ActionSchema } from '@dmx-controller/proto/controller_pb';
import { hasAction } from '../external_controller/externalController';
import { rgbwToHex } from '../util/colorUtil';
import styles from './Tile.module.scss';

interface TileProps {
  tileId: bigint;
  tile: Scene_Tile;
  onDragTile: () => void;
  onDropTile: () => void;
  onSelect: () => void;
  x: number;
  y: number;
  priority: number;
}

export function Tile({
  tileId,
  tile,
  onDragTile,
  onDropTile,
  onSelect,
  x,
  y,
  priority,
}: TileProps) {
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

  const details = useMemo(
    () => tileTileDetails(tile),
    [toJson(Scene_TileSchema, tile)],
  );

  const hasControllerMapping = useMemo(() => {
    if (controllerName) {
      const hasMapping = hasAction(
        project,
        controllerName,
        create(ControllerMapping_ActionSchema, {
          action: {
            case: 'sceneMapping',
            value: {
              actions: {
                [project.activeScene.toString()]: {
                  action: {
                    case: 'tileStrengthId',
                    value: tileId,
                  },
                },
              },
            },
          },
        }),
      );
      return hasMapping;
    } else {
      return false;
    }
  }, [project, controllerName, tileId]);

  const background = useMemo(() => {
    if (details.colors.length === 0) {
      return null;
    } else if (details.colors.length === 1) {
      return complexColorToHex(details.colors[0], palette);
    }

    let gradient = 'linear-gradient(135deg, ';
    for (let i = 0; i < details.colors.length; i++) {
      const color = complexColorToHex(details.colors[i], palette);

      gradient += i === 0 ? '' : ', ';
      if (color != null) {
        gradient += color;
      } else {
        gradient += 'transparent';
      }
    }
    return gradient + ')';
  }, [details, palette]);

  const toggle = useCallback(() => {
    const [modified, enabled] = toggleTile(tile, beat);
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
      }}
    >
      <div className={styles.contents}>
        <div
          className={styles.settingsTriangle}
          onClick={(e) => {
            onSelect();
            e.stopPropagation();
          }}
        ></div>
        <div className={styles.title} style={{ background: background as any }}>
          {details.wled && <div className={styles.wled}></div>}
          {tile.name}
        </div>
        {priority != 0 && <div className={styles.priority}>{priority}</div>}
        {hasControllerMapping && (
          <div className={styles.controller}>
            <SiMidi />
          </div>
        )}
      </div>
      <div className={styles.border} style={{ opacity: activeAmount }}></div>
    </div>
  );
}

function complexColorToHex(
  complexColor: FixtureState['lightColor'],
  palette: ColorPalette,
) {
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
      color = create(ColorSchema, { red: 0, green: 0, blue: 0, white: 1 });
    } else if (complexColor.value === PaletteColor.PALETTE_BLACK) {
      color = create(ColorSchema, { red: 0, green: 0, blue: 0, white: 0 });
    }
  }

  if (color == null) {
    return null;
  }

  return rgbwToHex(color.red, color.green, color.blue, color.white || 0);
}
