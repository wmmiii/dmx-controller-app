import { BeatMetadata } from "@dmx-controller/proto/beat_pb";
import { DmxUniverse, WritableDevice, getWritableDevice, isAngleChannel, mapDegrees } from "./fixture";
import { Effect, EffectTiming } from "@dmx-controller/proto/effect_pb";
import { FixtureDefinition_Channel_AngleMapping } from "@dmx-controller/proto/fixture_pb";
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

export const DEFAULT_COLOR_PALETTE = new ColorPalette({
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
  readonly t: number;
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
    const beatMetadata = project
      .assets
      ?.audioFiles[show.audioTrack?.audioFileId]
      ?.beatMetadata;
    const context: Omit<RenderContext, 'output'> = {
      t: t,
      project: project,
      colorPalette: show.colorPalette || DEFAULT_COLOR_PALETTE,
      universe: universe,
    };

    for (const track of show.lightTracks) {
      const output = getWritableDevice(project, track.outputId);
      if (output) {
        const trackContext = Object.assign({}, context, { output });
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
    return;
  }

  for (const row of scene.rows.slice().reverse()) {
    for (const component of row.components.slice().reverse()) {
      if (component.oneShot && component.transition.case === 'startFadeOutMs') {
        continue;
      }

      const sinceTransition = Number(BigInt(absoluteT) - component.transition.value);

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
            const effect = channel.effect;
            const effectLength = effect.endMs - effect.startMs;

            const durationEffect = getComponentDurationMs(component, beatMetadata);
            let effectT: number;
            if (component.oneShot) {
              if (component.duration.case === 'durationBeat') {
                effectT = (sinceTransition * effectLength) / beatMetadata.lengthMs;
              } else {
                effectT = sinceTransition;
              }

              // Only play once
              if (effectT > durationEffect) {
                break;
              }

            } else {
              if (component.duration.case === 'durationBeat') {
                effectT = (beatT * effectLength) / beatMetadata.lengthMs;
              } else {
                effectT = (absoluteT * effectLength) / component.duration.value;
              }
            }

            const output = getWritableDevice(project, channel.outputId);
            if (output != null) {
              applyEffect({
                t: effectT,
                output: output,
                project: project,
                colorPalette: scene.colorPalette || DEFAULT_COLOR_PALETTE,
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
              sequenceT = (absoluteT * SEQUENCE_BEAT_RESOLUTION * sequence.nativeBeats / component.duration.value) % (sequence.nativeBeats * SEQUENCE_BEAT_RESOLUTION);
            }
          }

          renderUniverseSequence(
            sequenceT,
            frame,
            sequence,
            project,
            scene.colorPalette || DEFAULT_COLOR_PALETTE,
            after);
          break;

        default:
          console.error(`Unrecognized description type ${component.description}.`);
          return universe;
      }

      interpolateUniverses(universe, amount, before, after);
    }
  }

  return universe;
}

function renderUniverseSequence(
  t: number,
  frame: number,
  universeSequence: Scene_Component_SequenceComponent,
  project: Project,
  colorPalette: ColorPalette,
  universe: DmxUniverse,
) {
  if (universeSequence) {
    const context: Omit<RenderContext, 'output'> = {
      t: t,
      project: project,
      colorPalette: colorPalette,
      universe: universe,
    };

    for (const track of universeSequence.lightTracks) {
      const output = getWritableDevice(project, track.outputId);
      if (output != null) {
        const trackContext = Object.assign({}, context, { output });
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
    const fixtureDefinition = project.fixtureDefinitions[fixture.fixtureDefinitionId.toString()];
    // Can happen if fixture has not yet set a definition.
    if (!fixtureDefinition) {
      continue;
    }

    for (const channel of Object.entries(fixtureDefinition.channels)) {
      const index = parseInt(channel[0]) - 1 + fixture.channelOffset;
      let value = channel[1].defaultValue;
      if (isAngleChannel(channel[1].type)) {
        const mapping = channel[1].mapping.value as FixtureDefinition_Channel_AngleMapping;
        value += fixture.channelOffsets[channel[1].type] || 0;
        value = mapDegrees(value, mapping.minDegrees, mapping.maxDegrees);
      }
      universe[index] = value;
    }
  }
}

function applyEffect(context: RenderContext, beat: BeatMetadata, frame: number, effect: Effect): void {
  let offsetMs: number;
  switch (effect.offset.case) {
    case 'offsetBeat':
      offsetMs = effect.offset.value * beat.lengthMs;
      break;
    case 'offsetMs':
      offsetMs = effect.offset.value;
      break;
    default:
      offsetMs = 0;
  }

  // Calculate beat
  const virtualBeat = (context.t + offsetMs - Number(beat.offsetMs)) *
    (effect.timingMultiplier || 1);
  const beatIndex = Math.floor(virtualBeat / beat.lengthMs);
  const beatT = ((virtualBeat % beat.lengthMs) / beat.lengthMs) % 1;

  // Calculate timing
  /** The [0, 1] value of how far in the effect we are. */
  let effectT: number;
  switch (effect.timingMode) {
    case EffectTiming.ONE_SHOT:
      // TODO: Implement mirrored for one-shots.
      const relativeT =
        (context.t + offsetMs - effect.startMs) /
        (effect.endMs - effect.startMs) *
        (effect.timingMultiplier || 1);
      effectT = relativeT % 1;
      if (effect.mirrored && Math.floor(relativeT) % 2) {
        effectT = 1 - effectT;
      }
      break;
    case EffectTiming.BEAT:
      if (beat) {
        effectT = beatT;
        if (effect.mirrored && beatIndex % 2) {
          effectT = 1 - effectT;
        }
      } else {
        effectT = 0;
      }
      break;
    default:
      throw Error('Unknown effect timing!');
  }

  if (effect.effect.case === 'staticEffect') {
    applyState(effect.effect.value.state, context);

  } else if (effect.effect.case === 'rampEffect') {
    rampEffect(
      context,
      effect.effect.value,
      effectT);
  } else if (effect.effect.case === 'strobeEffect') {
    strobeEffect(context, effect.effect.value, frame);
  }
}
