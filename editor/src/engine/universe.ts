import { BeatMetadata } from "@dmx-controller/proto/beat_pb";
import { DmxUniverse, WritableDevice, getPhysicalWritableDevice, getPhysicalWritableDeviceFromGroup } from "./fixture";
import { Effect, EffectTiming } from "@dmx-controller/proto/effect_pb";
import { LightLayer } from "@dmx-controller/proto/light_layer_pb";
import { LightTrack } from "@dmx-controller/proto/light_track_pb";
import { Project } from "@dmx-controller/proto/project_pb";
import { SEQUENCE_BEAT_RESOLUTION, applyFixtureSequence } from "./fixtureSequence";
import { applyState } from "./effect";
import { rampEffect } from "./rampEffect";
import { interpolateUniverses } from "./utils";
import { strobeEffect } from "./strobeEffect";

export interface RenderContext {
  readonly t: number;
  readonly output: LightTrack['output'];
  readonly project: Project;
  readonly universe: DmxUniverse;
}

export function renderShowToUniverse(t: number, frame: number, project: Project):
  DmxUniverse {
  t += project.timingOffsetMs;

  const universe = new Uint8Array(512);

  applyDefaults(project, universe);

  const show = project.shows[project.selectedShow || 0];

  if (show) {
    const beatMetadata = project
      .assets
      ?.audioFiles[show.audioTrack?.audioFileId]
      ?.beatMetadata;
    const context: Partial<RenderContext> = {
      t: t,
      project: project,
      universe: universe,
    };

    for (const track of show.lightTracks) {
      const trackContext = Object.assign({}, context, { output: track.output });
      renderLayersToUniverse(t, track.layers, trackContext, beatMetadata, frame);
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

  const universe = new Uint8Array(512);

  applyDefaults(project, universe);

  const scene = project.scenes[project.activeScene];
  if (!scene) {
    return;
  }

  for (const component of scene.components) {
    if (component.universeSequenceId === 0) {
      continue;
    }

    let amount: number = 0;
    if (component.transition.case === 'startFadeInMs') {
      const fadeInMs = component.fadeInDuration.case === 'fadeInBeat' ?
        (component.fadeInDuration.value || 0) * beatMetadata.lengthMs :
        (component.fadeInDuration.value || 0);

      amount = Math.min(1, (absoluteT - Number(component.transition.value)) / fadeInMs);
    } else if (component.transition.case === 'startFadeOutMs') {
      const fadeOutMs = component.fadeOutDuration.case === 'fadeOutBeat' ?
        (component.fadeOutDuration.value || 0) * beatMetadata.lengthMs :
        (component.fadeOutDuration.value || 0);

      amount = Math.max(0, 1 - ((absoluteT - Number(component.transition.value)) / fadeOutMs));
    }

    const sequence = project.universeSequences[component.universeSequenceId];

    let sequenceT: number
    if (component.duration?.case === 'durationMs') {
      sequenceT = (absoluteT * SEQUENCE_BEAT_RESOLUTION / component.duration.value) % (sequence.nativeBeats * SEQUENCE_BEAT_RESOLUTION);
    } else {
      sequenceT = (beatT % (beatMetadata.lengthMs * sequence.nativeBeats)) * SEQUENCE_BEAT_RESOLUTION / beatMetadata.lengthMs;
    }

    const before = new Uint8Array(universe);
    const after = new Uint8Array(universe);
    renderUniverseSequence(
      sequenceT,
      frame,
      component.universeSequenceId,
      project,
      after);

    interpolateUniverses(universe, project, amount, before, after);
  }

  return universe;
}

function renderUniverseSequence(
  t: number,
  frame: number,
  universeSequenceId: number,
  project: Project,
  universe: DmxUniverse,
) {
  const universeSequence = project.universeSequences[universeSequenceId];

  if (universeSequence) {
    const context: Partial<RenderContext> = {
      t: t,
      project: project,
      universe: universe,
    };

    for (const track of universeSequence.lightTracks) {
      const trackContext = Object.assign({}, context, { output: track.output });
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

export function renderSequenceToUniverse(
  t: number,
  fixtureSequenceId: number,
  beatMetadata: BeatMetadata,
  frame: number,
  output: LightTrack['output'],
  project: Project,
): DmxUniverse {
  t += project.timingOffsetMs;

  const universe = new Uint8Array(512);

  applyDefaults(project, universe);

  const fixtureSequence = project.fixtureSequences[fixtureSequenceId];

  if (fixtureSequence) {
    const context: RenderContext = {
      t: t,
      output: output,
      project: project,
      universe: universe,
    };

    renderLayersToUniverse(t, fixtureSequence.layers, context, beatMetadata, frame);
  }

  return universe;
}

export function renderLayersToUniverse(
  t: number,
  layers: LightLayer[],
  context: Partial<RenderContext>,
  beatMetadata: BeatMetadata,
  frame: number,
): void {
  for (const layer of layers) {
    const effect = layer.effects.find((e) => e.startMs <= t && e.endMs > t);
    if (effect) {
      applyEffect(context as RenderContext, beatMetadata, frame, effect);
    }
  }
}

function applyDefaults(project: Project, universe: DmxUniverse): void {
  for (const fixture of Object.values(project.physicalFixtures)) {
    const fixtureDefinition = project.fixtureDefinitions[fixture.fixtureDefinitionId];
    for (const channel of Object.entries(fixtureDefinition.channels)) {
      const index = parseInt(channel[0]) - 1 + fixture.channelOffset;
      universe[index] = channel[1].defaultValue;
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
    if (effect.effect.value.effect.case === 'state') {
      applyState(effect.effect.value.effect.value, context);
    } else {
      applyFixtureSequence(
        context,
        effect.effect.value.effect.value,
        effectT,
        beatIndex,
        beatT,
        frame);
    }

  } else if (effect.effect.case === 'rampEffect') {
    rampEffect(
      context,
      effect.effect.value,
      effectT,
      beatIndex,
      beatT,
      frame);
  } else if (effect.effect.case === 'strobeEffect') {
    strobeEffect(context, effect.effect.value, frame);
  }
}

export function getDevice(
  { output, project, universe }: {
    output: LightTrack['output'];
    project: Project;
    universe: DmxUniverse;
  }
): WritableDevice | undefined {

  switch (output.case) {
    case 'physicalFixtureId':
      return getPhysicalWritableDevice(
        project,
        output.value,
        universe);
    case 'physicalFixtureGroupId':
      return getPhysicalWritableDeviceFromGroup(
        project,
        output.value,
        universe);
    case undefined:
      return undefined;
    default:
      throw Error('Unknown device!');
  }
}
