import { BeatMetadata } from "@dmx-controller/proto/beat_pb";
import { DmxUniverse, WritableDevice, getWritableDevice, mapDegrees } from "./fixture";
import { Effect, Effect_RampEffect, EffectTiming } from "@dmx-controller/proto/effect_pb";
import { LightLayer } from "@dmx-controller/proto/light_layer_pb";
import { Project } from "@dmx-controller/proto/project_pb";
import { SEQUENCE_BEAT_RESOLUTION } from "../components/UniverseSequenceEditor";
import { Scene_Component_SequenceComponent } from "@dmx-controller/proto/scene_pb";
import { applyState } from "./effect";
import { getActiveUniverse, getComponentDurationMs } from "../util/projectUtils";
import { interpolateUniverses } from "./utils";
import { rampEffect } from "./rampEffect";
import { strobeEffect } from "./strobeEffect";
import { ColorPalette } from "@dmx-controller/proto/color_pb";
import { hsvToColor, interpolatePalettes } from "../util/colorUtil";
import { OutputId, OutputId_FixtureMapping } from "@dmx-controller/proto/output_id_pb";
import { getAllFixtures } from "./group";
import { randomEffect } from "./randomEffect";

export const DEFAULT_COLOR_PALETTE = new ColorPalette({
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
}

export function renderShowToUniverse(t: number, frame: number, project: Project):
  DmxUniverse {
  t += project.timingOffsetMs;

  const universe = new Array(512).fill(0);

  applyDefaults(project, universe);

  const show = project.shows[project.selectedShow || 0];

  if (show) {
    if (show.audioTrack?.audioFileId == null) {

    }
    let beatMetadata: BeatMetadata | undefined;
    if (show.audioTrack?.audioFileId != null) {
      beatMetadata = project
        .assets
        ?.audioFiles[show.audioTrack?.audioFileId]
        ?.beatMetadata;
    }
    if (beatMetadata == null) {
      throw new Error('Tried to render a frame for a show with an audio file without beat metadata!');
    }
    const context: Omit<Omit<RenderContext, 'output'>, 'outputId'> = {
      globalT: t,
      t: t,
      project: project,
      colorPalette: show.colorPalette || DEFAULT_COLOR_PALETTE,
      universe: universe,
    };

    for (const track of show.lightTracks) {
      if (track.outputId == null) {
        continue;
      }
      const output = getWritableDevice(project, track.outputId);
      if (output) {
        const trackContext = Object.assign({}, context, { outputId: track.outputId, output });
        renderLayersToUniverse(t, track.layers, trackContext, beatMetadata, frame);
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

  applyDefaults(project, universe);

  const scene = project.scenes[project.activeScene];
  if (!scene) {
    return universe;
  }

  const colorPaletteT = Math.min(1, Number(BigInt(t) - scene.colorPaletteStartTransition) / scene.colorPaletteTransitionDurationMs);
  const colorPalette = interpolatePalettes(
    scene.colorPalettes[scene.lastActiveColorPalette],
    scene.colorPalettes[scene.activeColorPalette],
    colorPaletteT);

  const sortedComponents = scene.componentMap
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
    .map(c => c.component!);

  for (const component of sortedComponents) {
    if (component.oneShot && component.transition.case === 'startFadeOutMs') {
      continue;
    }

    const sinceTransition = Number(BigInt(absoluteT) - (component.transition.value || 0n));

    let amount: number = 0;
    if (component.transition.case === 'startFadeInMs') {
      const fadeInMs = component.fadeInDuration.case === 'fadeInBeat' ?
        (component.fadeInDuration.value || 0) * beatMetadata.lengthMs :
        (component.fadeInDuration.value || 0);

      amount = Math.min(1, sinceTransition / fadeInMs);
    } else if (component.transition.case === 'startFadeOutMs') {
      const fadeOutMs = component.fadeOutDuration.case === 'fadeOutBeat' ?
        (component.fadeOutDuration.value || 0) * beatMetadata.lengthMs :
        (component.fadeOutDuration.value || 0);

      if (sinceTransition > fadeOutMs) {
        continue;
      }

      amount = Math.max(0, 1 - sinceTransition / fadeOutMs);
    }

    const before = [...universe];
    const after = [...universe];

    switch (component.description.case) {
      case 'effectGroup':
        for (const channel of component.description.value.channels) {
          if (channel.outputId == null) {
            continue;
          }

          const effect = channel.effect;
          if (effect == null) {
            throw new Error('Tried to render component without effect!');
          }
          const effectLength = effect.endMs - effect.startMs;

          const durationEffect = getComponentDurationMs(component, beatMetadata);
          let effectT: number;
          if (component.oneShot) {
            if (component.duration.case === 'durationBeat') {
              effectT = (sinceTransition * effectLength) / beatMetadata.lengthMs;
            } else {
              effectT = (sinceTransition * effectLength) / durationEffect;
            }

            // Only play once
            if (effectT > effectLength) {
              break;
            }

          } else {
            if (component.duration.case === 'durationBeat') {
              effectT = (beatT * effectLength) / beatMetadata.lengthMs;
            } else {
              if (component.duration.value == null) {
                throw new Error('Tried to render effect group component without a duration!');
              }
              effectT = (absoluteT * effectLength) / component.duration.value;
            }
          }

          const output = getWritableDevice(project, channel.outputId);
          if (output != null) {
            applyEffect({
              globalT: t,
              t: effectT,
              outputId: channel.outputId,
              output: output,
              project: project,
              colorPalette: colorPalette,
              universe: after,
            }, beatMetadata, frame, effect);
          }
        }
        break;

      case 'sequence':
        const sequence = component.description.value;

        const durationSequence = SEQUENCE_BEAT_RESOLUTION * sequence.nativeBeats;
        let sequenceT: number;
        if (component.oneShot) {
          const relativeT = sinceTransition * SEQUENCE_BEAT_RESOLUTION;
          if (component.duration.case === 'durationBeat') {
            sequenceT = relativeT / beatMetadata.lengthMs;
          } else {
            if (component.duration.value == null) {
              throw new Error('Tried to render sequence component without a duration!');
            }
            sequenceT = (relativeT * sequence.nativeBeats) / component.duration.value;
          }

          // Only play once
          if (sequenceT > durationSequence) {
            break;
          }

        } else {
          if (component.duration?.case === 'durationBeat') {
            sequenceT = (beatT % (beatMetadata.lengthMs * sequence.nativeBeats)) * SEQUENCE_BEAT_RESOLUTION / beatMetadata.lengthMs;
          } else {
            if (component.duration.value == null) {
              throw new Error('Tried to render effect group component without a duration!');
            }
            sequenceT = (absoluteT * SEQUENCE_BEAT_RESOLUTION * sequence.nativeBeats / component.duration.value) % (sequence.nativeBeats * SEQUENCE_BEAT_RESOLUTION);
          }
        }

        renderUniverseSequence(
          t,
          sequenceT,
          frame,
          sequence,
          project,
          colorPalette,
          after);
        break;

      default:
        console.error(`Unrecognized description type ${component.description}.`);
        return universe;
    }

    interpolateUniverses(universe, amount, before, after);
  }

  return universe;
}

export function renderGroupDebugToUniverse(project: Project, groupId: bigint) {
  const universe = new Array(512).fill(0);

  const fixtures = project.groups[groupId.toString()].fixtures[project.activeUniverse.toString()].fixtures;
  for (let index = 0; index < fixtures.length; index++) {
    const fixtureMapping = new OutputId_FixtureMapping();
    fixtureMapping.fixtures[project.activeUniverse.toString()] = fixtures[index];
    const output = getWritableDevice(project, new OutputId({
      output: {
        case: 'fixtures',
        value: fixtureMapping,
      }
    }));

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
  universeSequence: Scene_Component_SequenceComponent,
  project: Project,
  colorPalette: ColorPalette,
  universe: DmxUniverse,
) {
  if (universeSequence) {
    const context: Omit<Omit<RenderContext, 'output'>, 'outputId'> = {
      globalT: globalT,
      t: t,
      project: project,
      colorPalette: colorPalette,
      universe: universe,
    };

    for (const track of universeSequence.lightTracks) {
      if (track.outputId == null) {
        continue;
      }
      const output = getWritableDevice(project, track.outputId);
      if (output != null) {
        const trackContext = Object.assign({}, context, { outputId: track.outputId, output });
        renderLayersToUniverse(
          t,
          track.layers,
          trackContext,
          new BeatMetadata({
            lengthMs: SEQUENCE_BEAT_RESOLUTION,
            offsetMs: 0n,
          }),
          frame);
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

function applyDefaults(project: Project, universe: DmxUniverse): void {
  for (const fixture of Object.values(getActiveUniverse(project).fixtures)) {
    const fixtureDefinition = project.fixtureDefinitions[fixture.fixtureDefinitionId];
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
      }
      universe[index] = value;
    }
  }
}

function applyEffect(context: RenderContext, beat: BeatMetadata, frame: number, effect: Effect): void {
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
      applyToEachFixture(context, context.outputId.output.value, (i, total, outputId, output) => {
        const amount = ramp.phase / total;
        const effectT = calculateEffectT(context, beat, effect, ramp, amount * i);
        rampEffect(Object.assign({}, context, { output, outputId }), ramp, effectT);
      });
    } else {
      const effectT = calculateEffectT(context, beat, effect, ramp, 0);
      rampEffect(context, ramp, effectT);
    }
  } else if (effect.effect.case === 'randomEffect') {
    if (effect.effect.value.treatFixturesIndividually && context.outputId.output.case === 'group') {
      const e = effect.effect.value;
      applyToEachFixture(context, context.outputId.output.value, (i, _, outputId, output) => {
        randomEffect(Object.assign({}, context, { output, outputId }), e, frame, i);
      })
    } else {
      randomEffect(context, effect.effect.value, frame);
    }
  }
}

function calculateEffectT(context: RenderContext, beat: BeatMetadata, effect: Effect, ramp: Effect_RampEffect, phaseOffset: number) {
  // Calculate beat
  const virtualBeat = (context.t - Number(beat.offsetMs)) *
    (ramp.timingMultiplier || 1) * (ramp.mirrored ? 2 : 1) +
    phaseOffset * Number(beat.lengthMs);
  const beatIndex = Math.floor(virtualBeat / beat.lengthMs);
  const beatT = ((virtualBeat % beat.lengthMs) / beat.lengthMs) % 1;

  // Calculate timing
  /** The [0, 1] value of how far in the effect we are. */
  switch (ramp.timingMode) {
    case EffectTiming.ONE_SHOT:
      const relativeT =
        (context.t - effect.startMs) /
        (effect.endMs - effect.startMs) *
        (ramp.timingMultiplier || 1) * (ramp.mirrored ? 2 : 1) +
        phaseOffset;
      let effectT = (relativeT) % 1;
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

function applyToEachFixture(context: RenderContext, groupId: bigint, action: (i: number, total: number, outputId: OutputId, device: WritableDevice) => void) {
  const fixtures = getAllFixtures(context.project, groupId);
  for (let i = 0; i < fixtures.length; ++i) {
    const fixtureMapping: { [key: string]: bigint } = {};
    fixtureMapping[context.project.activeUniverse.toString()] = fixtures[i];
    const outputId = new OutputId({
      output: {
        case: 'fixtures',
        value: {
          fixtures: fixtureMapping,
        }
      }
    });

    const device = getWritableDevice(context.project, outputId);
    if (device) {
      action(i, fixtures.length, outputId, device);
    }
  }
}
