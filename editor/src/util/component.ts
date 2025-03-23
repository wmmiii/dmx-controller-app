import { BeatMetadata } from "@dmx-controller/proto/beat_pb";
import { Scene_Component } from "@dmx-controller/proto/scene_pb";

export function getComponentDurationMs(component: Scene_Component, beat: BeatMetadata) {
  switch (component.duration.case) {
    case 'durationBeat':
      if (component.description.case === 'sequence') {
        return component.description.value.nativeBeats * beat.lengthMs;
      } else {
        return beat.lengthMs;
      }
    case 'durationMs':
      return component.duration.value;
    default:
      return beat.lengthMs;
  }
}

export function componentActiveAmount(component: Scene_Component, beat: BeatMetadata, t: bigint): number {
  if (component.transition.case === 'startFadeInMs') {
    if (component.oneShot) {
      const duration = getComponentDurationMs(component, beat);
      return t < component.transition.value + BigInt(Math.floor(duration)) ? 1 : 0;
    } else {
      return 1;
    }
  } else if (component.transition.case === 'absoluteStrength') {
    return component.transition.value;
  }
  return 0;
}

export function toggleComponent(component: Scene_Component, beat: BeatMetadata) {
  const enabled = component.oneShot ||
    component.transition.case === 'startFadeOutMs' ||
    (component.transition.case === 'absoluteStrength' && component.transition.value < 0.1);

  const t = BigInt(new Date().getTime());
  if (component.transition.case === undefined || component.transition.case === 'absoluteStrength') {
    component.transition = {
      case: 'startFadeOutMs',
      value: 0n,
    };
  }

  // One shot components should always restart now.
  if (enabled && component.oneShot) {
    component.transition = {
      case: 'startFadeInMs',
      value: t,
    };
    return [true, enabled];
  }

  const fadeInMs = component.fadeInDuration.case === 'fadeInBeat' ?
    (component.fadeInDuration.value || 0) * beat.lengthMs :
    (component.fadeInDuration.value || 0);

  const fadeOutMs = component.fadeOutDuration.case === 'fadeOutBeat' ?
    (component.fadeOutDuration.value || 0) * beat.lengthMs :
    (component.fadeOutDuration.value || 0);

  if (!enabled && component.transition.case === 'startFadeInMs') {
    // Calculate fade in amount.
    const since = Number(t - component.transition.value);
    const amount = since === 0 ? 0 : Math.min(1, since / fadeInMs);

    // Set fade out such that effect is contiguous.
    component.transition = {
      case: 'startFadeOutMs',
      value: t - BigInt(Math.floor((1 - amount) * fadeOutMs)),
    };
    return [true, enabled];
  } else if (enabled && component.transition.case === 'startFadeOutMs') {
    // Calculate fade out amount.
    const since = Number(t - component.transition.value);
    const amount = since === 0 ? 0 : Math.max(0, 1 - (since / fadeOutMs));

    // Set fade in such that effect is contiguous.
    component.transition = {
      case: 'startFadeInMs',
      value: t - BigInt(Math.floor(amount * fadeInMs)),
    };
    return [true, enabled];
  } else {
    return [false, enabled];
  }
}