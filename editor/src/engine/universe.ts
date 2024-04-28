import { DmxUniverse, WritableDevice, getPhysicalWritableDevice, getPhysicalWritableDeviceFromGroup } from "./fixture";
import { Effect, EffectTiming } from "@dmx-controller/proto/effect_pb";
import { Project } from "@dmx-controller/proto/project_pb";
import { Show_LightTrack } from "@dmx-controller/proto/show_pb";
import { applyState } from "./effect";
import { rampEffect } from "./rampEffect";
import { AudioFile_BeatMetadata } from "@dmx-controller/proto/audio_pb";
import { LightLayer } from "@dmx-controller/proto/light_layer_pb";
import { applySequence } from "./sequence";
import { idMapToArray } from "../util/mapUtils";

interface RenderContext {
  t: number;
  beatMetadata?: AudioFile_BeatMetadata;
  output: Show_LightTrack['output'];
  project: Project;
  universe: DmxUniverse;
}

export function renderShowToUniverse(t: number, project: Project):
  DmxUniverse {
  const universe = new Uint8Array(512);

  const show = project.shows[project.selectedShow || 0];

  if (show) {
    for (const defaultValues of project.defaultChannelValues) {
      const device = getDevice(defaultValues.output, project, universe);
      if (!device) {
        continue;
      }

      idMapToArray(defaultValues.channels)
        .forEach(([i, c]) => device.setChannel(i, c));
    }

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
      renderLayersToUniverse(t, track.layers, context, track.output);
    }
  }

  return universe;
}

export function renderSequenceToUniverse(
  t: number,
  sequenceId: number,
  beatMetadata: AudioFile_BeatMetadata,
  output: Show_LightTrack['output'],
  project: Project,
):
  DmxUniverse {
  const universe = new Uint8Array(512);

  const sequence = project.sequences[sequenceId];

  if (sequence) {
    const context: Partial<RenderContext> = {
      t: t,
      beatMetadata: beatMetadata,
      project: project,
      universe: universe,
    };

    renderLayersToUniverse(t, sequence.layers, context, output);
  }

  return universe;
}

function renderLayersToUniverse(
  t: number,
  layers: LightLayer[],
  context: Partial<RenderContext>,
  output: Show_LightTrack['output'],
): void {
  for (const layer of layers) {
    const effect = layer.effects.find((e) => e.startMs <= t && e.endMs > t);
    if (effect) {
      applyEffect(
        Object.assign({
          t: context.t + effect.offsetMs,
          output: output,
        }, context) as RenderContext,
        effect);
    }
  }
}

function applyEffect(context: RenderContext, effect: Effect): void {
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
        const beat = context.beatMetadata;
        const virtualBeat = (context.t - beat.offsetMs) * effect.timingMultiplier;
        t = ((virtualBeat % beat.lengthMs) / beat.lengthMs) % 1;
        const beatIndex = Math.floor(virtualBeat / beat.lengthMs);
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
    const device = getDevice(
      context.output,
      context.project,
      context.universe);
    if (effect.effect.value.effect.case === 'state') {
      applyState(effect.effect.value.effect.value, device);
    } else {
      applySequence(effect.effect.value.effect.value, device);
    }

  } else if (effect.effect.case === 'rampEffect') {
    rampEffect(
      effect.effect.value,
      context.t,
      context.output,
      context.project,
      context.universe);
  }
}

export function getDevice(
  output: Show_LightTrack['output'],
  project: Project,
  universe: DmxUniverse): WritableDevice | undefined {

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
