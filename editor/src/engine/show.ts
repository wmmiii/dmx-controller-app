import { DmxUniverse, } from "./fixture";
import { Effect, Effect_RampEffect, Effect_StaticEffect, EffectTiming } from "@dmx-controller/proto/effect_pb";
import { Project } from "@dmx-controller/proto/project_pb";
import { Show_LightTrack } from "@dmx-controller/proto/show_pb";
import { applyState, getDevice } from "./effectUtils";
import { rampEffect } from "./rampEffect";
import { AudioFile_BeatMetadata } from "@dmx-controller/proto/audio_pb";

interface RenderContext {
  t: number;
  beatMetadata?: AudioFile_BeatMetadata;
  output: Show_LightTrack['output'];
  project: Project;
  universe: DmxUniverse;
}

export function renderUniverse(t: number, project: Project):
  DmxUniverse {
  const universe = new Uint8Array(512);

  const show = project.show;

  if (show) {
    for (const defaultValues of show.defaultChannelValues) {
      const device = getDevice(defaultValues.output, project, universe);
      if (!device) {
        continue;
      }

      for (const channel of defaultValues.channels) {
        device.setChannel(channel.index, channel.value);
      }
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
      for (const layer of track.layers) {
        const effect = layer.effects.find((e) => e.startMs <= t && e.endMs > t);
        if (effect) {
          applyEffect(
            Object.assign({
              t: context.t + effect.offsetMs,
              output: track.output,
            }, context) as RenderContext,
            effect);
        }
      }
    }
  }

  return universe;
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
        t = (((context.t - beat.offsetMs) % beat.lengthMs) / beat.lengthMs) * effect.timingMultiplier % 1;
        const beatIndex = Math.floor((context.t - beat.offsetMs) / beat.lengthMs * effect.timingMultiplier);
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

  const e = effect.effect.value;
  switch (effect.effect.case) {
    case 'staticEffect':
      const device = getDevice(
        context.output,
        context.project,
        context.universe);
      applyState((e as Effect_StaticEffect).state, device);
      break;
    case 'rampEffect':
      rampEffect(
        e as Effect_RampEffect,
        context.t,
        context.output,
        context.project,
        context.universe);
      break;
  }
}
