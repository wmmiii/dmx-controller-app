import { ControllerMapping_TileStrength } from "@dmx-controller/proto/controller_pb";
import { Project } from "@dmx-controller/proto/project_pb";
import { ControlCommandType } from "../contexts/ControllerContext";
import { tileActiveAmount, toggleTile } from "../util/tile";

export function performTileStrength(
  project: Project,
  action: ControllerMapping_TileStrength,
  value: number,
  cct: ControlCommandType,
) {
  const tileMapping = project.scenes[action.scene].tileMap.find(
    (t) => t.id === action.tileId,
  );
  if (tileMapping && tileMapping.tile) {
    if (cct != null) {
      // Fader input.
      tileMapping.tile.transition = {
        case: "absoluteStrength",
        value: value,
      };
      return true;
    } else if (value > 0.5) {
      toggleTile(tileMapping.tile, project.liveBeat!);
      return true;
    }
  }
  return true;
}

export function outputTileStrength(
  project: Project,
  action: ControllerMapping_TileStrength,
  t: bigint,
) {
  const tile = project.scenes[action.scene].tileMap.find(
    (m) => m.id === action.tileId,
  )?.tile;
  if (tile && project.liveBeat) {
    return tileActiveAmount(tile, project.liveBeat, t);
  } else {
    return 0;
  }
}
