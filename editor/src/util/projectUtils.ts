import { create } from '@bufbuild/protobuf';
import { Effect, FixtureState } from '@dmx-controller/proto/effect_pb';
import { PatchSchema } from '@dmx-controller/proto/output_pb';
import { Project, ProjectSchema } from '@dmx-controller/proto/project_pb';
import { Scene_Tile } from '@dmx-controller/proto/scene_pb';
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
    .filter(([_, output]) => output.output.case === 'SerialDmxOutput')
    .map(([id, _]) => BigInt(id))[0];
}

export function createNewProject() {
  const defaultColorPaletteId = crypto.randomUUID();
  const defaultPatchId = randomUint64();

  return create(ProjectSchema, {
    name: 'Untitled Project',
    updateFrequencyMs: 15,
    timingOffsetMs: 0,
    scenes: [
      {
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
    ],
    liveBeat: {
      lengthMs: Math.floor(60_000 / 120),
      offsetMs: 0n,
    },
    activePatch: defaultPatchId,
    patches: {
      [defaultPatchId.toString()]: createNewPatch('Default Patch'),
    },
    fixtureDefinitions: {},
    controllerMapping: {},
  });
}

export function createNewPatch(name: string) {
  const defaultSerialDmxOutputId = randomUint64();

  return create(PatchSchema, {
    name: name,
    outputs: {
      [defaultSerialDmxOutputId.toString()]: {
        name: 'DMX Serial Output',
        latencyMs: 0,
        output: {
          case: 'SerialDmxOutput',
          value: {
            fixtures: {},
          },
        },
      },
    },
  });
}

type Color = FixtureState['lightColor'];

export function tileTileDetails(tile: Scene_Tile) {
  const colors: Color[] = [];

  const collect = (effect: Effect) => {
    if (effect.effect.case === 'staticEffect') {
      if (effect.effect.value.state?.lightColor.case) {
        colors.push(effect.effect.value.state?.lightColor);
        return;
      }
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
    }
  };

  if (tile.description.case === 'sequence') {
    const sequence = tile.description.value;
    sequence.lightTracks
      .flatMap((t) => t.layers)
      .flatMap((t) => t.effects)
      .filter((e) => e != null)
      .forEach(collect);
  } else if (tile.description.case === 'effectGroup') {
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
