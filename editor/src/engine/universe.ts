import { create } from '@bufbuild/protobuf';
import {
  BeatMetadataSchema,
  type BeatMetadata,
} from '@dmx-controller/proto/beat_pb';
import {
  ColorPaletteSchema,
  type ColorPalette,
} from '@dmx-controller/proto/color_pb';
import {
  EffectTiming,
  type Effect,
  type Effect_RampEffect,
} from '@dmx-controller/proto/effect_pb';
import { type LightLayer } from '@dmx-controller/proto/light_layer_pb';
import {
  OutputIdSchema,
  OutputId_FixtureMappingSchema,
  type OutputId,
} from '@dmx-controller/proto/output_id_pb';
import { type Project } from '@dmx-controller/proto/project_pb';
import { type Scene_Tile_SequenceTile } from '@dmx-controller/proto/scene_pb';

import { SEQUENCE_BEAT_RESOLUTION } from '../components/UniverseSequenceEditor';
import { hsvToColor, interpolatePalettes } from '../util/colorUtil';
import { getActiveUniverse } from '../util/projectUtils';
import { getTileDurationMs } from '../util/tile';

import { applyState } from './effect';
import {
  DmxUniverse,
  WritableDevice,
  getWritableDevice,
  mapDegrees,
} from './fixture';
import { getAllFixtures } from './group';
import { rampEffect } from './rampEffect';
import { randomEffect } from './randomEffect';
import { strobeEffect } from './strobeEffect';
import { interpolateUniverses } from './utils';

export const DEFAULT_COLOR_PALETTE = create(ColorPaletteSchema, {
  name: 'Unset palette',
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
});

export interface RenderContext {
  readonly globalT: number;
  readonly t: number;
  readonly outputId: OutputId;
  readonly output: WritableDevice;
  readonly project: Project;
  readonly colorPalette: ColorPalette;
  readonly universe: DmxUniverse;
  readonly nonInterpolatedIndices: number[];
}

export function renderShowToUniverse(
  t: number,
  frame: number,
  project: Project,
): DmxUniverse {
  t += project.timingOffsetMs;

  const universe = new Array(512).fill(0);

  const nonInterpolatedIndices = applyDefaults(project, universe);

  const show = project.shows[project.selectedShow || 0];

  if (show) {
    if (show.audioTrack?.audioFileId == null) {
    }
    let beatMetadata: BeatMetadata | undefined;
    if (show.audioTrack?.audioFileId != null) {
      beatMetadata =
        project.assets?.audioFiles[show.audioTrack?.audioFileId]?.beatMetadata;
    }
    if (beatMetadata == null) {
      throw new Error(
        'Tried to render a frame for a show with an audio file without beat metadata!',
      );
    }
    const context: Omit<Omit<RenderContext, 'output'>, 'outputId'> = {
      globalT: t,
      t: t,
      project: project,
      colorPalette: show.colorPalette || DEFAULT_COLOR_PALETTE,
      universe: universe,
      nonInterpolatedIndices: nonInterpolatedIndices,
    };

    for (const track of show.lightTracks) {
      if (track.outputId == null) {
        continue;
      }
      const output = getWritableDevice(project, track.outputId);
      if (output) {
        const trackContext = Object.assign({}, context, {
          outputId: track.outputId,
          output,
        });
        renderLayersToUniverse(
          t,
          track.layers,
          trackContext,
          beatMetadata,
          frame,
        );
      }
    }
  }

  return universe;
}

export function renderSceneToUniverse(
  t: number,
  beatMetadata: BeatMetadata,
  frame: number,
  project: Project,
): DmxUniverse {
  const absoluteT = t + project.timingOffsetMs;
  const beatT = t + project.timingOffsetMs - Number(beatMetadata.offsetMs);

  const universe = new Array(512).fill(0);

  const nonInterpolatedIndices = applyDefaults(project, universe);

  const scene = project.scenes[project.activeScene];
  if (!scene) {
    return universe;
  }

  const colorPaletteT = Math.min(
    1,
    Number(BigInt(t) - scene.colorPaletteStartTransition) /
      scene.colorPaletteTransitionDurationMs,
  );
  const colorPalette = interpolatePalettes(
    scene.colorPalettes[scene.lastActiveColorPalette],
    scene.colorPalettes[scene.activeColorPalette],
    colorPaletteT,
  );

  const sortedTiles = scene.tileMap
    .sort((a, b) => {
      if (a.priority != b.priority) {
        return a.priority - b.priority;
      }
      if (a.y != b.y) {
        return b.y - a.y;
      }
      if (a.x != b.x) {
        return b.x - a.x;
      }
      return 0;
    })
    .map((t) => t.tile!);

  for (const tile of sortedTiles) {
    if (tile.oneShot && tile.transition.case === 'startFadeOutMs') {
      continue;
    }

    const sinceTransition = Number(
      BigInt(absoluteT) -
        (tile.transition.case != 'absoluteStrength'
          ? tile.transition.value || 0n
          : 0n),
    );

    let amount: number = 0;
    if (tile.transition.case === 'startFadeInMs') {
      const fadeInMs =
        tile.fadeInDuration.case === 'fadeInBeat'
          ? (tile.fadeInDuration.value || 0) * beatMetadata.lengthMs
          : tile.fadeInDuration.value || 0;

      amount = Math.min(1, sinceTransition / fadeInMs);
    } else if (tile.transition.case === 'startFadeOutMs') {
      const fadeOutMs =
        tile.fadeOutDuration.case === 'fadeOutBeat'
          ? (tile.fadeOutDuration.value || 0) * beatMetadata.lengthMs
          : tile.fadeOutDuration.value || 0;

      if (sinceTransition > fadeOutMs) {
        continue;
      }

      amount = Math.max(0, 1 - sinceTransition / fadeOutMs);
    } else if (tile.transition.case === 'absoluteStrength') {
      amount = tile.transition.value;
    }

    const before = [...universe];
    const after = [...universe];

    switch (tile.description.case) {
      case 'effectGroup':
        for (const channel of tile.description.value.channels) {
          if (channel.outputId == null) {
            continue;
          }

          const effect = channel.effect;
          if (effect == null) {
            throw new Error('Tried to render tile without effect!');
          }
          const effectLength = effect.endMs - effect.startMs;

          const durationEffect = getTileDurationMs(tile, beatMetadata);
          let effectT: number;
          if (tile.oneShot) {
            if (tile.duration.case === 'durationBeat') {
              effectT =
                (sinceTransition * effectLength) / beatMetadata.lengthMs;
            } else {
              effectT = (sinceTransition * effectLength) / durationEffect;
            }

            // Only play once
            if (effectT > effectLength) {
              break;
            }
          } else {
            if (tile.duration.case === 'durationBeat') {
              effectT =
                (beatT * effectLength) /
                (beatMetadata.lengthMs * (tile.duration.value || 1));
            } else {
              if (tile.duration.value == null) {
                throw new Error(
                  'Tried to render effect group tile without a duration!',
                );
              }
              effectT = (absoluteT * effectLength) / tile.duration.value;
            }
          }

          const output = getWritableDevice(project, channel.outputId);
          if (output != null) {
            applyEffect(
              {
                globalT: t,
                t: effectT,
                outputId: channel.outputId,
                output: output,
                project: project,
                colorPalette: colorPalette,
                universe: after,
                nonInterpolatedIndices: nonInterpolatedIndices,
              },
              beatMetadata,
              frame,
              effect,
            );
          }
        }
        break;

      case 'sequence':
        const sequence = tile.description.value;

        const durationSequence =
          SEQUENCE_BEAT_RESOLUTION * sequence.nativeBeats;
        let sequenceT: number;
        if (tile.oneShot) {
          const relativeT = sinceTransition * SEQUENCE_BEAT_RESOLUTION;
          if (tile.duration.case === 'durationBeat') {
            sequenceT = relativeT / beatMetadata.lengthMs;
          } else {
            if (tile.duration.value == null) {
              throw new Error(
                'Tried to render sequence tile without a duration!',
              );
            }
            sequenceT =
              (relativeT * sequence.nativeBeats) / tile.duration.value;
          }

          // Only play once
          if (sequenceT > durationSequence) {
            break;
          }
        } else {
          if (tile.duration?.case === 'durationBeat') {
            sequenceT =
              ((beatT % (beatMetadata.lengthMs * sequence.nativeBeats)) *
                SEQUENCE_BEAT_RESOLUTION) /
              beatMetadata.lengthMs;
          } else {
            if (tile.duration.value == null) {
              throw new Error(
                'Tried to render effect group tile without a duration!',
              );
            }
            sequenceT =
              ((absoluteT * SEQUENCE_BEAT_RESOLUTION * sequence.nativeBeats) /
                tile.duration.value) %
              (sequence.nativeBeats * SEQUENCE_BEAT_RESOLUTION);
          }
        }

        renderUniverseSequence(
          t,
          sequenceT,
          frame,
          sequence,
          project,
          colorPalette,
          after,
        );
        break;

      default:
        console.error(`Unrecognized description type ${tile.description}.`);
        return universe;
    }

    interpolateUniverses(
      universe,
      amount,
      before,
      after,
      nonInterpolatedIndices,
    );
  }

  return universe;
}

export function renderGroupDebugToUniverse(project: Project, groupId: bigint) {
  const universe = new Array(512).fill(0);

  const fixtures =
    project.groups[groupId.toString()].fixtures[
      project.activeUniverse.toString()
    ].fixtures;
  for (let index = 0; index < fixtures.length; index++) {
    const fixtureMapping = create(OutputId_FixtureMappingSchema, {
      fixtures: {
        [project.activeUniverse.toString()]: fixtures[index],
      },
    });
    const output = getWritableDevice(
      project,
      create(OutputIdSchema, {
        output: {
          case: 'fixtures',
          value: fixtureMapping,
        },
      }),
    );

    const color = hsvToColor(index / fixtures.length, 1, 1);

    output?.setAmount(universe, 'dimmer', 1);
    output?.setColor(universe, color.red, color.green, color.blue);
  }

  return universe;
}

function renderUniverseSequence(
  globalT: number,
  t: number,
  frame: number,
  universeSequence: Scene_Tile_SequenceTile,
  project: Project,
  colorPalette: ColorPalette,
  universe: DmxUniverse,
) {
  if (universeSequence) {
    const nonInterpolatedIndices = applyDefaults(project, [...universe]);

    const context: Omit<Omit<RenderContext, 'output'>, 'outputId'> = {
      globalT: globalT,
      t: t,
      project: project,
      colorPalette: colorPalette,
      universe: universe,
      nonInterpolatedIndices: nonInterpolatedIndices,
    };

    for (const track of universeSequence.lightTracks) {
      if (track.outputId == null) {
        continue;
      }
      const output = getWritableDevice(project, track.outputId);
      if (output != null) {
        const trackContext = Object.assign({}, context, {
          outputId: track.outputId,
          output,
        });
        renderLayersToUniverse(
          t,
          track.layers,
          trackContext,
          create(BeatMetadataSchema, {
            lengthMs: SEQUENCE_BEAT_RESOLUTION,
            offsetMs: 0n,
          }),
          frame,
        );
      }
    }
  }
}

function renderLayersToUniverse(
  t: number,
  layers: LightLayer[],
  context: RenderContext,
  beatMetadata: BeatMetadata,
  frame: number,
): void {
  for (const layer of layers) {
    const effect = layer.effects.find((e) => e.startMs <= t && e.endMs > t);
    if (effect) {
      applyEffect(context, beatMetadata, frame, effect);
    }
  }
}

/** Applies default values to all indices and returns an array of non-interpolated channels; */
function applyDefaults(project: Project, universe: DmxUniverse): number[] {
  const nonInterpolatedIndices: number[] = [];
  for (const fixture of Object.values(getActiveUniverse(project).fixtures)) {
    const fixtureDefinition =
      project.fixtureDefinitions[fixture.fixtureDefinitionId];
    // Can happen if fixture has not yet set a definition.
    if (!fixtureDefinition) {
      continue;
    }

    const fixtureMode = fixtureDefinition.modes[fixture.fixtureMode];

    if (!fixtureMode) {
      continue;
    }

    for (const channel of Object.entries(fixtureMode.channels)) {
      const index = parseInt(channel[0]) - 1 + fixture.channelOffset;
      let value = channel[1].defaultValue;
      if (channel[1].mapping.case === 'angleMapping') {
        const mapping = channel[1].mapping.value;
        value += fixture.channelOffsets[channel[1].type] || 0;
        value = mapDegrees(value, mapping.minDegrees, mapping.maxDegrees);
      } else if (channel[1].mapping.case === 'colorWheelMapping') {
        nonInterpolatedIndices.push(index);
      }
      universe[index] = value;
    }
  }
  return nonInterpolatedIndices;
}

function applyEffect(
  context: RenderContext,
  beat: BeatMetadata,
  frame: number,
  effect: Effect,
): void {
  if (effect.effect.case === 'staticEffect') {
    if (effect.effect.value.state == null) {
      throw new Error('Tried to render static effect without state!');
    }
    applyState(effect.effect.value.state, context);
  } else if (effect.effect.case === 'strobeEffect') {
    strobeEffect(context, effect.effect.value, frame);
  } else if (effect.effect.case === 'rampEffect') {
    const ramp = effect.effect.value;

    if (ramp.phase != 0 && context.outputId.output.case === 'group') {
      applyToEachFixture(
        context,
        context.outputId.output.value,
        (i, total, outputId, output) => {
          const amount = ramp.phase / total;
          const effectT = calculateEffectT(
            context,
            beat,
            effect,
            ramp,
            amount * i,
          );
          rampEffect(
            Object.assign({}, context, { output, outputId }),
            ramp,
            effectT,
          );
        },
      );
    } else {
      const effectT = calculateEffectT(context, beat, effect, ramp, 0);
      rampEffect(context, ramp, effectT);
    }
  } else if (effect.effect.case === 'randomEffect') {
    if (
      effect.effect.value.treatFixturesIndividually &&
      context.outputId.output.case === 'group'
    ) {
      const e = effect.effect.value;
      applyToEachFixture(
        context,
        context.outputId.output.value,
        (i, _, outputId, output) => {
          randomEffect(
            Object.assign({}, context, { output, outputId }),
            e,
            frame,
            i,
          );
        },
      );
    } else {
      randomEffect(context, effect.effect.value, frame);
    }
  }
}

function calculateEffectT(
  context: RenderContext,
  beat: BeatMetadata,
  effect: Effect,
  ramp: Effect_RampEffect,
  phaseOffset: number,
) {
  // Calculate beat
  const virtualBeat =
    (context.t - Number(beat.offsetMs)) *
      (ramp.timingMultiplier || 1) *
      (ramp.mirrored ? 2 : 1) +
    phaseOffset * Number(beat.lengthMs);
  const beatIndex = Math.floor(virtualBeat / beat.lengthMs);
  const beatT = ((virtualBeat % beat.lengthMs) / beat.lengthMs) % 1;

  // Calculate timing
  /** The [0, 1] value of how far in the effect we are. */
  switch (ramp.timingMode) {
    case EffectTiming.ONE_SHOT:
      const relativeT =
        ((context.t - effect.startMs) / (effect.endMs - effect.startMs)) *
          (ramp.timingMultiplier || 1) *
          (ramp.mirrored ? 2 : 1) +
        phaseOffset;
      let effectT = relativeT % 1;
      if (ramp.mirrored && Math.floor(relativeT) % 2) {
        return 1 - effectT;
      } else {
        return effectT;
      }
    case EffectTiming.BEAT:
      if (beat) {
        if (ramp.mirrored && beatIndex % 2) {
          return 1 - beatT;
        } else {
          return beatT;
        }
      } else {
        return 0;
      }
    default:
      throw Error('Unknown effect timing!');
  }
}

function applyToEachFixture(
  context: RenderContext,
  groupId: bigint,
  action: (
    i: number,
    total: number,
    outputId: OutputId,
    device: WritableDevice,
  ) => void,
) {
  const fixtures = getAllFixtures(context.project, groupId);
  for (let i = 0; i < fixtures.length; ++i) {
    const fixtureMapping: { [key: string]: bigint } = {};
    fixtureMapping[context.project.activeUniverse.toString()] = fixtures[i];
    const outputId = create(OutputIdSchema, {
      output: {
        case: 'fixtures',
        value: {
          fixtures: fixtureMapping,
        },
      },
    });

    const device = getWritableDevice(context.project, outputId);
    if (device) {
      action(i, fixtures.length, outputId, device);
    }
  }
}
