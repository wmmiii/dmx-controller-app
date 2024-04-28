import { LightLayer } from "@dmx-controller/proto/light_layer_pb";
import { Project } from "@dmx-controller/proto/project_pb"
import { WritableDevice } from "./fixture";
import { SequenceMapping } from "@dmx-controller/proto/effect_pb";

// Good resolution, nice divisors (2, 3, 4, 5, 6, 12 etc.)
export const SEQUENCE_BEAT_RESOLUTION = 36000;

export function applySequence(sequence: SequenceMapping, device: WritableDevice):
    void {
  
}

export function sequences(project: Project, forbidden?: number):
  Project['sequences'] {
  if (forbidden == null) {
    return project.sequences;
  }

  const depMap: { [key: number]: Set<number> } = {};
  for (const idString in project.sequences) {
    recursivelyGetDepMap(parseInt(idString), project, depMap);
  }

  const allowed: Project['sequences'] = {};
  for (const idString in depMap) {
    const id = parseInt(idString);
    if (!depMap[id].has(forbidden)) {
      allowed[id] = project.sequences[id];
    }
  }

  return allowed;
}

function recursivelyGetDepMap(id: number, project: Project, depMap: { [key: number]: Set<number> }): Set<number> {
  if (depMap[id] != null) {
    return depMap[id];
  }

  const sequence = project.sequences[id];
  if (sequence == null) {
    return new Set<number>();
  }

  depMap[id] = new Set<number>();
  depMap[id].add(id);

  const addRecursive = (dep: number) => {
    recursivelyGetDepMap(
      dep,
      project,
      depMap).forEach(d => depMap[id].add(d));
  }

  for (let l of sequence.layers) {
    for (let e of l.effects) {
      if (e.effect.case === 'staticEffect') {
        if (e.effect.value.effect.case === 'sequence') {
          addRecursive(e.effect.value.effect.value.sequenceId);
        }
      } else if (e.effect.case === 'rampEffect') {
        if (e.effect.value.start.case === 'sequenceMappingStart') {
          addRecursive(e.effect.value.start.value.sequenceId);
        }
        if (e.effect.value.end.case === 'sequenceMappingEnd') {
          addRecursive(e.effect.value.end.value.sequenceId);
        }
      }
    }
  }

  return depMap[id];
}

export function deleteSequence(sequenceId: number, project: Project): void {
  // Remove from sequences
  Object.values(project.sequences)
    .forEach(s => s.layers
      .forEach(l => deleteSequenceFromLightLayer(sequenceId, l)));

  // Remove from shows
  project.shows
    .forEach(s => s.lightTracks
      .forEach(t => t.layers
        .forEach(l => deleteSequenceFromLightLayer(sequenceId, l))))

  // Retire sequences number
  delete project.sequences[sequenceId];
}

function deleteSequenceFromLightLayer(
    sequenceId: number, lightLayer: LightLayer): void {
  lightLayer.effects.forEach(e => {
    if (e.effect.case === 'staticEffect') {
      if (e.effect.value.effect.case === 'sequence') {
        if (e.effect.value.effect.value.sequenceId === sequenceId) {
          e.effect.value.effect.value.sequenceId = 0;
        }
      }
    } else if (e.effect.case === 'rampEffect') {
      if (e.effect.value.start.case === 'sequenceMappingStart') {
        if (e.effect.value.start.value.sequenceId === sequenceId) {
          e.effect.value.start.value.sequenceId = 0;
        }
      }
      if (e.effect.value.end.case === 'sequenceMappingEnd') {
        if (e.effect.value.end.value.sequenceId === sequenceId) {
          e.effect.value.end.value.sequenceId = 0;
        }
      }
    }
  });
}
