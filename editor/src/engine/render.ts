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
import { type Project } from '@dmx-controller/proto/project_pb';
import { type Scene_Tile_SequenceTile } from '@dmx-controller/proto/scene_pb';

import { SEQUENCE_BEAT_RESOLUTION } from '../components/UniverseSequenceEditor';
import { hsvToColor, interpolatePalettes } from '../util/colorUtil';
import { getTileDurationMs } from '../util/tile';

import {
  OutputTarget,
  OutputTargetSchema,
} from '@dmx-controller/proto/output_pb';
import { RenderContext, WritableOutput } from './context';
import { applyState } from './effect';
import { WritableDeviceCache } from './fixtures/writableDevice';
import { getAllFixtures } from './group';
import { rampEffect } from './rampEffect';
import { randomEffect } from './randomEffect';
import { strobeEffect } from './strobeEffect';

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
}) as ColorPalette;

export function renderShowToUniverse(
  t: number,
  frame: number,
  project: Project,
  output: WritableOutput,
) {
  t += project.timingOffsetMs;

  const writableDeviceCache = new WritableDeviceCache(project, output.outputId);

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
    const context: Omit<Omit<RenderContext, 'target'>, 'writableDevice'> = {
      globalT: t,
      t: t,
      project: project,
      output: output,
      colorPalette: show.colorPalette || DEFAULT_COLOR_PALETTE,
      writableDeviceCache: writableDeviceCache,
    };

    for (const track of show.lightTracks) {
      if (track.outputTarget == null) {
        continue;
      }
      const writableDevice = writableDeviceCache.get(track.outputTarget);
      if (output) {
        const trackContext = Object.assign({}, context, {
          target: track.outputTarget,
          writableDevice,
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
}

export function renderSceneToUniverse(
  t: number,
  beatMetadata: BeatMetadata,
  frame: number,
  project: Project,
  output: WritableOutput,
) {
  const absoluteT = t + project.timingOffsetMs;
  const beatT = t + project.timingOffsetMs - Number(beatMetadata.offsetMs);

  const writableDeviceCache = new WritableDeviceCache(project, output.outputId);

  const scene = project.scenes[project.activeScene];
  if (!scene) {
    return;
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

    const before = output.clone();
    const after = output.clone();

    switch (tile.description.case) {
      case 'effectGroup':
        for (const channel of tile.description.value.channels) {
          if (channel.outputTarget == null) {
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

          const writableDevice = writableDeviceCache.get(channel.outputTarget);
          if (writableDevice != null) {
            applyEffect(
              {
                globalT: t,
                t: effectT,
                project: project,
                output: after,
                target: channel.outputTarget,
                colorPalette: colorPalette,
                writableDeviceCache: writableDeviceCache,
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
          sequenceT,
          frame,
          sequence,
          project,
          colorPalette,
          after,
        );
        break;

      default:
        throw Error(`Unrecognized description type ${tile.description}.`);
    }

    output.interpolate(before, after, amount);
  }
}

export function renderGroupDebugToUniverse(
  project: Project,
  groupId: bigint,
  output: WritableOutput,
) {
  const deviceCache = new WritableDeviceCache(project, output.outputId);
  const fixtures = getAllFixtures(project, groupId);
  for (let index = 0; index < fixtures.length; index++) {
    const writableDevice = deviceCache.get(
      create(OutputTargetSchema, {
        output: {
          case: 'fixtures',
          value: {
            fixtureIds: [fixtures[index]],
          },
        },
      }),
    );

    const color = hsvToColor(index / fixtures.length, 1, 1);

    writableDevice?.setAmount(output, 'dimmer', 1);
    writableDevice?.setColor(output, color.red, color.green, color.blue);
  }
}

function renderUniverseSequence(
  t: number,
  frame: number,
  universeSequence: Scene_Tile_SequenceTile,
  project: Project,
  colorPalette: ColorPalette,
  output: WritableOutput,
) {
  if (universeSequence) {
    const writableDeviceCache = new WritableDeviceCache(
      project,
      output.outputId,
    );
    const context: Omit<Omit<RenderContext, 'target'>, 'writableDevice'> = {
      globalT: t,
      t: t,
      project: project,
      output: output,
      colorPalette: colorPalette,
      writableDeviceCache: writableDeviceCache,
    };

    for (const track of universeSequence.lightTracks) {
      if (track.outputTarget == null) {
        continue;
      }
      const writableDevice = writableDeviceCache.get(track.outputTarget);
      if (writableDevice != null) {
        const trackContext = Object.assign({}, context, {
          target: track.outputTarget,
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

    if (ramp.phase != 0 && context.target.output.case === 'group') {
      applyToEachFixture(
        context,
        context.target.output.value,
        (i, total, target) => {
          const amount = ramp.phase / total;
          const effectT = calculateEffectT(
            context,
            beat,
            effect,
            ramp,
            amount * i,
          );
          rampEffect(Object.assign({}, context, { target }), ramp, effectT);
        },
      );
    } else {
      const effectT = calculateEffectT(context, beat, effect, ramp, 0);
      rampEffect(context, ramp, effectT);
    }
  } else if (effect.effect.case === 'randomEffect') {
    if (
      effect.effect.value.treatFixturesIndividually &&
      context.target.output.case === 'group'
    ) {
      const e = effect.effect.value;
      applyToEachFixture(
        context,
        context.target.output.value,
        (i, _, target) => {
          randomEffect(Object.assign({}, context, { target }), e, frame, i);
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
  action: (i: number, total: number, target: OutputTarget) => void,
) {
  const fixtures = getAllFixtures(context.project, groupId);
  for (let i = 0; i < fixtures.length; ++i) {
    const target = create(OutputTargetSchema, {
      output: {
        case: 'fixtures',
        value: {
          fixtureIds: [fixtures[i]],
        },
      },
    });

    action(i, fixtures.length, target);
  }
}
