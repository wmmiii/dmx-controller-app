import { Project } from '@dmx-controller/proto/project_pb';

import { ControlCommandType } from '../contexts/ControllerContext';
import { getActiveScene } from '../util/sceneUtils';
import { tileActiveAmount, toggleTile } from '../util/tile';

export function performTileStrength(
  project: Project,
  tileId: bigint,
  value: number,
  cct: ControlCommandType,
) {
  let actionPerformed = false;

  const tile = getActiveScene(project).tileMap.find(
    (tile) => tile.id === tileId,
  );

  if (tile?.tile) {
    if (cct != null) {
      // Fader input.
      tile.tile.transition = {
        case: 'absoluteStrength',
        value: value,
      };
      actionPerformed ||= true;
    } else if (value > 0.5) {
      toggleTile(tile.tile, project.liveBeat!);
      actionPerformed ||= true;
    }
  }
  return actionPerformed;
}

export function outputTileStrength(
  project: Project,
  tileId: bigint,
  t: bigint,
) {
  const tile = getActiveScene(project).tileMap.find(
    (m) => m.id === tileId,
  )?.tile;
  if (tile) {
    return tileActiveAmount(tile, project.liveBeat, t);
  } else {
    return 0;
  }
}
