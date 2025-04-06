import { Effect, FixtureState } from "@dmx-controller/proto/effect_pb";
import { Project } from "@dmx-controller/proto/project_pb";
import { Scene_Tile } from "@dmx-controller/proto/scene_pb";

export function getActiveUniverse(project: Project) {
  return project?.universes[project.activeUniverse.toString()];
}

type Color = FixtureState["lightColor"];

export function tileTileDetails(tile: Scene_Tile) {
  const colors: Color[] = [];

  const collect = (effect: Effect) => {
    if (effect.effect.case === "staticEffect") {
      if (effect.effect.value.state?.lightColor.case) {
        colors.push(effect.effect.value.state?.lightColor);
        return;
      }
    } else if (effect.effect.case === "rampEffect") {
      if (
        effect.effect.value.stateStart?.lightColor.case ||
        effect.effect.value.stateEnd?.lightColor.case
      ) {
        colors.push(
          effect.effect.value.stateStart?.lightColor || {
            case: undefined,
            value: undefined,
          },
        );
        colors.push(
          effect.effect.value.stateEnd?.lightColor || {
            case: undefined,
            value: undefined,
          },
        );
      }
    } else if (effect.effect.case === "strobeEffect") {
      if (
        effect.effect.value.stateA?.lightColor.case ||
        effect.effect.value.stateB?.lightColor.case
      ) {
        colors.push(
          effect.effect.value.stateA?.lightColor || {
            case: undefined,
            value: undefined,
          },
        );
        colors.push(
          effect.effect.value.stateB?.lightColor || {
            case: undefined,
            value: undefined,
          },
        );
      }
    }
  };

  if (tile.description.case === "sequence") {
    const sequence = tile.description.value;
    sequence.lightTracks
      .flatMap((t) => t.layers)
      .flatMap((t) => t.effects)
      .filter((e) => e != null)
      .forEach(collect);
  } else if (tile.description.case === "effectGroup") {
    const group = tile.description.value;
    group.channels
      .map((t) => t.effect!)
      .filter((e) => e != null)
      .forEach(collect);
  }

  return {
    colors: colors,
  };
}
