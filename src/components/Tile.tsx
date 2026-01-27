import { create, toJsonString } from '@bufbuild/protobuf';
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
import { createRef, useCallback, useContext, useEffect, useMemo } from 'react';
import { SiMidi } from 'react-icons/si';

import { ControllerContext } from '../contexts/ControllerContext';
import { PaletteContext } from '../contexts/PaletteContext';
import { ProjectContext } from '../contexts/ProjectContext';
import { tileTileDetails } from '../util/projectUtils';
import { tileActiveAmount, toggleTile } from '../util/tile';

import { BeatMetadataSchema } from '@dmx-controller/proto/beat_pb';
import { ControllerMapping_ActionSchema } from '@dmx-controller/proto/controller_pb';
import { hasAction } from '../external_controller/externalController';
import { rgbwToHex } from '../util/colorUtil';
import { listenToTick } from '../util/time';
import styles from './Tile.module.scss';
import { VersatileElement } from './VersatileElement';

interface TileProps {
  tileId: bigint;
  tile: Scene_Tile;
  onSelect: () => void;
  x: number;
  y: number;
  priority: number;
}

export function Tile({ tileId, tile, onSelect, x, y, priority }: TileProps) {
  const { project, save } = useContext(ProjectContext);
  const { controllerName } = useContext(ControllerContext);
  const { palette } = useContext(PaletteContext);
  const activeRef = createRef<HTMLDivElement>();

  const toggle = useCallback(() => {
    const [modified, enabled] = toggleTile(tile, project.liveBeat!);
    if (modified) {
      save(`${enabled ? 'Enable' : 'Disable'} tile ${tile.name}.`);
    }
  }, [tile, toJsonString(BeatMetadataSchema, project.liveBeat!), save]);

  useEffect(() => {
    return listenToTick((t) => {
      if (!activeRef.current) {
        return;
      }
      const amount = tileActiveAmount(tile, project.liveBeat, t);
      activeRef.current.style.top = `${(1 - amount) * 100}%`;
    });
  }, [tile, project, activeRef]);

  const details = useMemo(
    () => tileTileDetails(tile),
    [toJsonString(Scene_TileSchema, tile)],
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

  const classes = [styles.tile];

  return (
    <VersatileElement
      className={classes.join(' ')}
      id={tileId}
      style={{
        gridColumnStart: x + 1,
        gridColumnEnd: x + 2,
        gridRowStart: y + 1,
        gridRowEnd: y + 2,
      }}
      onClick={toggle}
      onPress={onSelect}
      element={tileId}
      onDragComplete={() => save(`Move ${tile.name} tile.`)}
    >
      {!project.settings?.touchInterface && (
        <div
          className={styles.settingsTriangle}
          onClick={(e) => {
            onSelect();
            e.stopPropagation();
          }}
          onPointerDown={(e) => e.stopPropagation()}
        ></div>
      )}
      <div
        className={styles.title}
        style={{ background: background || undefined }}
      >
        {details.wled && <div className={styles.wled}></div>}
        {tile.name}
      </div>
      {priority != 0 && <div className={styles.priority}>{priority}</div>}
      {hasControllerMapping && (
        <div className={styles.controller}>
          <SiMidi />
        </div>
      )}
      <div className={styles.activeGage}>
        <div ref={activeRef}></div>
      </div>
    </VersatileElement>
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
