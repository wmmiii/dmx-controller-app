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
  t: number;
  beatMetadata?: BeatMetadata;
  output: LightTrack['output'];
  project: Project;
  universe: DmxUniverse;
}

export function renderShowToUniverse(t: number, project: Project):
  DmxUniverse {
  t += project.timingOffsetMs;

  const universe = new Uint8Array(512);

  applyDefaults(project, universe);

  const show = project.shows[project.selectedShow || 0];

  if (show) {
    const context: Partial<RenderContext> = {
      t: t,
      beatMetadata: project
        .assets
        ?.audioFiles[show.audioTrack?.audioFileId]
        ?.beatMetadata,
      project: project,
      universe: universe,
    };

    for (const track of show.lightTracks) {
      const trackContext = Object.assign({}, context, { output: track.output });
      renderLayersToUniverse(t, track.layers, trackContext);
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
      beatMetadata: beatMetadata,
      project: project,
      universe: universe,
    };

    for (const track of universeSequence.lightTracks) {
      const trackContext = Object.assign({}, context, { output: track.output });
      renderLayersToUniverse(t, track.layers, trackContext);
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
      beatMetadata: beatMetadata,
      output: output,
      project: project,
      universe: universe,
    };

    renderLayersToUniverse(t, fixtureSequence.layers, context);
  }

  return universe;
}

export function renderLayersToUniverse(
  t: number,
  layers: LightLayer[],
  context: Partial<RenderContext>,
): void {
  for (const layer of layers) {
    const effect = layer.effects.find((e) => e.startMs <= t && e.endMs > t);
    if (effect) {
      applyEffect(
        Object.assign({
          t: context.t + effect.offsetMs
        }, context) as RenderContext,
        effect);
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

function applyEffect(context: RenderContext, effect: Effect): void {
  const absoluteT = context.t;

  // Calculate beat
  const beat = context.beatMetadata;
  const virtualBeat = (context.t - Number(beat.offsetMs)) *
    (effect.timingMultiplier || 1);
  const beatIndex = Math.floor(virtualBeat / beat.lengthMs);
  const beatT = ((virtualBeat % beat.lengthMs) / beat.lengthMs) % 1;

  // Calculate timing
  let t: number;
  switch (effect.timingMode) {
    case EffectTiming.ONE_SHOT:
      // TODO: Implement mirrored for one-shots.
      const relativeT =
        (context.t - effect.startMs) /
        (effect.endMs - effect.startMs) *
        (effect.timingMultiplier || 1);
      t = relativeT % 1;
      if (effect.mirrored) {
        if (Math.floor(relativeT) % 2) {
          t = 1 - t;
        }
      }
      break;
    case EffectTiming.BEAT:
      if (context.beatMetadata) {
        t = beatT;
        if (effect.mirrored && beatIndex % 2) {
          t = 1 - t;
        }
      } else {
        t = 0;
      }
      break;
    case EffectTiming.ABSOLUTE:
    default:
      t = context.t;
  }

  context.t = t;

  if (effect.effect.case === 'staticEffect') {
    if (effect.effect.value.effect.case === 'state') {
      applyState(effect.effect.value.effect.value, context);
    } else {
      const amountT = (absoluteT - effect.startMs) /
        (effect.endMs - effect.startMs);

      applyFixtureSequence(
        context,
        effect.effect.value.effect.value,
        amountT,
        beatIndex,
        beatT);
    }

  } else if (effect.effect.case === 'rampEffect') {
    const amountT = (absoluteT - effect.startMs) /
      (effect.endMs - effect.startMs);

    rampEffect(
      context,
      effect.effect.value,
      amountT,
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
