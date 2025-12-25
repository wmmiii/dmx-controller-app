import { create } from '@bufbuild/protobuf';
import { Effect, FixtureState } from '@dmx-controller/proto/effect_pb';
import {
  OutputTarget,
  QualifiedFixtureId,
} from '@dmx-controller/proto/output_pb';
import { Project, ProjectSchema } from '@dmx-controller/proto/project_pb';
import { Scene_Tile } from '@dmx-controller/proto/scene_pb';
import { Show_Output } from '@dmx-controller/proto/show_pb';
import { isWledChannel } from '../engine/channel';
import { randomUint64 } from './numberUtils';

export function getActivePatch(project: Project) {
  return project?.patches[project.activePatch.toString()];
}

export function getOutput(project: Project, outputId: bigint) {
  const output = getActivePatch(project).outputs[outputId.toString()];
  if (!output) {
    throw Error(`Could not find output ${outputId}!`);
  }
  return output;
}

export function getSerialOutputId(project: Project) {
  return Object.entries(getActivePatch(project).outputs)
    .filter(([_, output]) => output.output.case === 'serialDmxOutput')
    .map(([id, _]) => BigInt(id))[0];
}

/**
 * Iterates through all occurrences of output targets and removes any that match the provided predicate.
 */
export function deleteFromOutputTargets(
  project: Project,
  deletePredicate: (id: QualifiedFixtureId) => boolean,
) {
  const deleteFromOutputTarget = (target: OutputTarget | undefined) => {
    if (target?.output.case === 'fixtures') {
      const fixtureIds = target.output.value.fixtureIds.filter(
        (id) => !deletePredicate(id),
      );
      target.output.value.fixtureIds = fixtureIds;
    }
  };

  // Delete from groups.
  for (const group of Object.values(project.groups)) {
    group.targets.forEach(deleteFromOutputTarget);
    group.targets = group.targets.filter(
      (t) =>
        t.output.case === 'fixtures' && t.output.value.fixtureIds.length !== 0,
    );
  }

  const deleteFromShowOutput = (o: Show_Output) =>
    deleteFromOutputTarget(o.outputTarget);

  // Delete from shows.
  Object.values(project.shows)
    .flatMap((s) => s.outputs)
    .forEach(deleteFromShowOutput);

  // Delete from scenes.
  Object.values(project.scenes)
    .flatMap((s) => s.tileMap)
    .map((r) => r.tile!)
    .forEach((o) => {
      o.channels.forEach((c) => deleteFromOutputTarget(c.outputTarget));
    });
}

export function createNewProject() {
  const defaultColorPaletteId = randomUint64();
  const defaultPatchId = randomUint64();
  const defaultSceneId = randomUint64();

  return create(ProjectSchema, {
    name: 'Untitled Project',
    activeScene: defaultSceneId,
    scenes: {
      [defaultSceneId.toString()]: {
        name: 'Default scene',
        tileMap: [],
        colorPalettes: {
          [defaultColorPaletteId.toString()]: {
            name: 'Default',
            primary: {
              color: {
                red: 1,
                green: 0,
                blue: 1,
              },
            },
            secondary: {
              color: {
                red: 0,
                green: 1,
                blue: 1,
              },
            },
            tertiary: {
              color: {
                red: 1,
                green: 1,
                blue: 0,
              },
            },
          },
        },
        activeColorPalette: defaultColorPaletteId,
        lastActiveColorPalette: defaultColorPaletteId,
        colorPaletteTransitionDurationMs: 3000,
      },
    },
    liveBeat: {
      lengthMs: Math.floor(60_000 / 120),
      offsetMs: 0n,
    },
    activePatch: defaultPatchId,
    patches: {
      [defaultPatchId.toString()]: { name: 'Default Patch', outputs: {} },
    },
    fixtureDefinitions: {},
    controllerMapping: {},
  });
}

type Color = FixtureState['lightColor'];

export function tileTileDetails(tile: Scene_Tile) {
  const colors: Color[] = [];
  let wled = false;

  const collect = (effect: Effect) => {
    if (effect.effect.case === 'staticEffect') {
      if (effect.effect.value.state?.lightColor.case) {
        colors.push(effect.effect.value.state?.lightColor);
      }
      wled ||= hasWledChannel(effect.effect.value.state);
    } else if (effect.effect.case === 'rampEffect') {
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
      wled ||= hasWledChannel(effect.effect.value.stateStart);
      wled ||= hasWledChannel(effect.effect.value.stateEnd);
    } else if (effect.effect.case === 'strobeEffect') {
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
      wled ||= hasWledChannel(effect.effect.value.stateA);
      wled ||= hasWledChannel(effect.effect.value.stateB);
    }
  };

  tile.channels
    .map((t) => t.effect!)
    .filter((e) => e != null)
    .forEach(collect);

  return {
    colors: colors,
    wled: wled,
  };
}

function hasWledChannel(state: FixtureState | undefined) {
  let hasChannels = false;
  for (const [c, v] of Object.entries(state || {})) {
    if (isWledChannel(c)) {
      hasChannels ||= v != null;
    }
  }
  return hasChannels;
}
