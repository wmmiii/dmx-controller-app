import { BeatMetadata } from "@dmx-controller/proto/beat_pb";
import { DmxUniverse, WritableDevice, getPhysicalWritableDevice, getPhysicalWritableDeviceFromGroup } from "./fixture";
import { Effect, EffectTiming } from "@dmx-controller/proto/effect_pb";
import { LightLayer } from "@dmx-controller/proto/light_layer_pb";
import { LightTrack } from "@dmx-controller/proto/light_track_pb";
import { Project } from "@dmx-controller/proto/project_pb";
import { SEQUENCE_BEAT_RESOLUTION, applyFixtureSequence } from "./fixtureSequence";
import { applyState } from "./effect";
import { idMapToArray } from "../util/mapUtils";
import { rampEffect } from "./rampEffect";

export interface RenderContext {
  readonly t: number;
  readonly output: LightTrack['output'];
  readonly project: Project;
  readonly universe: DmxUniverse;
}

export function renderShowToUniverse(t: number, project: Project):
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
      renderLayersToUniverse(t, track.layers, trackContext, beatMetadata);
    }
  }

  return universe;
}

export function renderSceneToUniverse(
  t: number,
  beatMetadata: BeatMetadata,
  project: Project,
): DmxUniverse {
  t = t + project.timingOffsetMs - Number(beatMetadata.offsetMs);

  const universe = new Uint8Array(512);

  applyDefaults(project, universe);

  const scene = project.scenes[project.activeScene];
  if (!scene) {
    return;
  }

  for (const component of scene.components) {
    if (!component.active || component.universeSequenceId === 0) {
      continue;
    }

    const sequence = project.universeSequences[component.universeSequenceId];

    // Beat mapping.
    const sequenceBeat = new BeatMetadata({
      offsetMs: BigInt(0),
      lengthMs: SEQUENCE_BEAT_RESOLUTION,
    });

    const sequenceT = (t % (beatMetadata.lengthMs * sequence.nativeBeats)) * SEQUENCE_BEAT_RESOLUTION / beatMetadata.lengthMs;

    renderUniverseSequence(
      sequenceT,
      component.universeSequenceId,
      sequenceBeat,
      project,
      universe);
  }

  return universe;
}

export function renderUniverseSequenceToUniverse(
  t: number,
  universeSequenceId: number,
  beatMetadata: BeatMetadata,
  project: Project,
) {
  t += project.timingOffsetMs;

  const universe = new Uint8Array(512);

  applyDefaults(project, universe);

  renderUniverseSequence(
    t,
    universeSequenceId,
    beatMetadata,
    project,
    universe);

  return universe;
}

function renderUniverseSequence(
  t: number,
  universeSequenceId: number,
  beatMetadata: BeatMetadata,
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
      renderLayersToUniverse(t, track.layers, trackContext, beatMetadata);
    }
  }
}

export function renderSequenceToUniverse(
  t: number,
  fixtureSequenceId: number,
  beatMetadata: BeatMetadata,
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

    renderLayersToUniverse(t, fixtureSequence.layers, context, beatMetadata);
  }

  return universe;
}

export function renderLayersToUniverse(
  t: number,
  layers: LightLayer[],
  context: Partial<RenderContext>,
  beatMetadata: BeatMetadata,
): void {
  for (const layer of layers) {
    const effect = layer.effects.find((e) => e.startMs <= t && e.endMs > t);
    if (effect) {
      applyEffect(context as RenderContext, beatMetadata, effect);
    }
  }
}

function applyDefaults(project: Project, universe: DmxUniverse): void {

  for (const defaultValues of project.defaultChannelValues) {
    const device = getDevice({
      output: defaultValues.output,
      project: project,
      universe: universe,
    });
    if (!device) {
      continue;
    }

    idMapToArray(defaultValues.channels)
      .forEach(([i, c]) => device.setChannel(i, c));
  }
}

function applyEffect(context: RenderContext, beat: BeatMetadata, effect: Effect): void {
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
        beatT);
    }

  } else if (effect.effect.case === 'rampEffect') {
    rampEffect(
      context,
      effect.effect.value,
      effectT,
      beatIndex,
      beatT);
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
    default:
      throw Error('Unknown device!');
  }
}
