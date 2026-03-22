import { Project } from '@dmx-controller/proto/project_pb';

import { ControlCommandType } from '../contexts/ControllerContext';
import { getActiveScene } from '../util/sceneUtils';
import { tileActiveAmount } from '../util/tile';

/**
 * @deprecated This function is only used for tests.
 * Actual MIDI tile strength actions are handled in Rust via perform_action.
 */
export function performTileStrength(
  project: Project,
  sceneId: bigint,
  tileId: bigint,
  value: number,
  cct: ControlCommandType,
) {
  let actionPerformed = false;

  const tile = project.scenes[sceneId.toString()]?.tileMap.find(
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
      // Toggle tile - simplified inline implementation for tests only.
      // One-shot tiles restart, loop tiles toggle fade state.
      const t = BigInt(new Date().getTime());
      if (tile.tile.timingDetails.case === 'oneShot') {
        tile.tile.transition = { case: 'startFadeInMs', value: t };
      } else {
        // For loop tiles, toggle between fade in and fade out
        const isActive = tile.tile.transition.case === 'startFadeInMs';
        tile.tile.transition = isActive
          ? { case: 'startFadeOutMs', value: t }
          : { case: 'startFadeInMs', value: t };
      }
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
