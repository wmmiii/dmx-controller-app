import { AudioFile_BeatMetadata } from "@dmx-controller/proto/audio_pb";
import { DmxUniverse, WritableDevice, getPhysicalWritableDevice, getPhysicalWritableDeviceFromGroup } from "./fixture";
import { Effect, EffectTiming } from "@dmx-controller/proto/effect_pb";
import { LightLayer } from "@dmx-controller/proto/light_layer_pb";
import { LightTrack } from "@dmx-controller/proto/light_track_pb";
import { Project } from "@dmx-controller/proto/project_pb";
import { applySequence } from "./sequence";
import { applyState } from "./effect";
import { idMapToArray } from "../util/mapUtils";
import { rampEffect } from "./rampEffect";

export interface RenderContext {
  t: number;
  beatMetadata?: AudioFile_BeatMetadata;
  output: LightTrack['output'];
  project: Project;
  universe: DmxUniverse;
}

export function renderShowToUniverse(t: number, project: Project):
  DmxUniverse {
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

export function renderSequenceToUniverse(
  t: number,
  sequenceId: number,
  beatMetadata: AudioFile_BeatMetadata,
  output: LightTrack['output'],
  project: Project,
):
  DmxUniverse {
  const universe = new Uint8Array(512);

  applyDefaults(project, universe);

  const sequence = project.sequences[sequenceId];

  if (sequence) {
    const context: RenderContext = {
      t: t,
      beatMetadata: beatMetadata,
      output: output,
      project: project,
      universe: universe,
    };

    renderLayersToUniverse(t, sequence.layers, context);
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
  const virtualBeat = (context.t - beat.offsetMs) *
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

      applySequence(
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
