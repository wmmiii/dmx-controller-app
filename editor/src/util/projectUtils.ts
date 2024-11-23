import { BeatMetadata } from "@dmx-controller/proto/beat_pb";
import { Project } from "@dmx-controller/proto/project_pb";
import { Scene_Component } from "@dmx-controller/proto/scene_pb";

export function getActiveUniverse(project: Project) {
  return project?.universes[project.activeUniverse.toString()];
}

export function getComponentDurationMs(component: Scene_Component, beat: BeatMetadata) {
  switch (component.duration.case) {
    case 'durationBeat':
      let nativeBeats = 1;
      if (component.description.case === 'sequence') {
        nativeBeats = component.description.value.nativeBeats;
      }
      return component.duration.value * beat.lengthMs * nativeBeats;
    case 'durationMs':
      return component.duration.value;
    default:
      return beat.lengthMs;
  }
}

export function componentActive(component: Scene_Component, beat: BeatMetadata, t: bigint) {
  if (component.transition.case === 'startFadeInMs') {
    if (component.oneShot) {
      const duration = getComponentDurationMs(component, beat);
      return t < component.transition.value + BigInt(Math.floor(duration));
    } else {
      return true;
    }
  } else {
    return false;
  }
}
