import { LightLayer } from "@dmx-controller/proto/light_layer_pb";
import { Project } from "@dmx-controller/proto/project_pb"
import { EffectTiming, FixtureSequenceMapping } from "@dmx-controller/proto/effect_pb";
import { RenderContext, renderLayersToUniverse } from "./universe";
import { BeatMetadata } from "@dmx-controller/proto/beat_pb";

// Good resolution, nice divisors (2, 3, 4, 5, 6, 12 etc.)
export const SEQUENCE_BEAT_RESOLUTION = 36000;

export function applyFixtureSequence(
  context: RenderContext,
  mapping: FixtureSequenceMapping,
  amountT: number,
  beatIndex: number,
  beatT: number):
  void {

  const fixtureSequence = context.project.fixtureSequences[mapping.fixtureSequenceId];
  if (fixtureSequence == null) {
    return;
  }

  const sequenceMs = fixtureSequence.nativeBeats * SEQUENCE_BEAT_RESOLUTION;

  let t = 0;
  switch (mapping.timingMode) {
    case EffectTiming.ABSOLUTE:
      console.error('Absolute timings for fixtureSequences are not implemented!');
      return;
    case EffectTiming.BEAT:
      t = ((beatIndex + beatT) * mapping.timingMultiplier) % fixtureSequence.nativeBeats;
      t *= SEQUENCE_BEAT_RESOLUTION;
      break;
    case EffectTiming.ONE_SHOT:
      t = ((amountT * mapping.timingMultiplier) % 1) * sequenceMs;
      break;
    default:
      console.error('Unrecognized timing type for fixtureSequence', mapping.timingMode);
  }


  // Re-time into fixtureSequence space.
  const sequenceContext = Object.assign({}, context, {
    beatMetadata: new BeatMetadata({
      lengthMs: SEQUENCE_BEAT_RESOLUTION,
      offsetMs: 0,
    }),
    t: t,
  });

  renderLayersToUniverse(t, fixtureSequence.layers, sequenceContext);
}

export function fixtureSequences(project: Project, forbidden?: number):
  Project['fixtureSequences'] {
  if (forbidden == null) {
    return project.fixtureSequences;
  }

  const depMap: { [key: number]: Set<number> } = {};
  for (const idString in project.fixtureSequences) {
    recursivelyGetDepMap(parseInt(idString), project, depMap);
  }

  const allowed: Project['fixtureSequences'] = {};
  for (const idString in depMap) {
    const id = parseInt(idString);
    if (!depMap[id].has(forbidden)) {
      allowed[id] = project.fixtureSequences[id];
    }
  }

  return allowed;
}

function recursivelyGetDepMap(id: number, project: Project, depMap: { [key: number]: Set<number> }): Set<number> {
  if (depMap[id] != null) {
    return depMap[id];
  }

  const fixtureSequence = project.fixtureSequences[id];
  if (fixtureSequence == null) {
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

  for (let l of fixtureSequence.layers) {
    for (let e of l.effects) {
      if (e.effect.case === 'staticEffect') {
        if (e.effect.value.effect.case === 'fixtureSequence') {
          addRecursive(e.effect.value.effect.value.fixtureSequenceId);
        }
      } else if (e.effect.case === 'rampEffect') {
        if (e.effect.value.start.case === 'fixtureSequenceMappingStart') {
          addRecursive(e.effect.value.start.value.fixtureSequenceId);
        }
        if (e.effect.value.end.case === 'fixtureSequenceMappingEnd') {
          addRecursive(e.effect.value.end.value.fixtureSequenceId);
        }
      }
    }
  }

  return depMap[id];
}

export function deleteSequence(fixtureSequenceId: number, project: Project): void {
  // Remove from fixtureSequences
  Object.values(project.fixtureSequences)
    .forEach(s => s.layers
      .forEach(l => deleteSequenceFromLightLayer(fixtureSequenceId, l)));

  // Remove from shows
  project.shows
    .forEach(s => s.lightTracks
      .forEach(t => t.layers
        .forEach(l => deleteSequenceFromLightLayer(fixtureSequenceId, l))))

  // Retire fixtureSequences number
  delete project.fixtureSequences[fixtureSequenceId];
}

function deleteSequenceFromLightLayer(
  fixtureSequenceId: number, lightLayer: LightLayer): void {
  lightLayer.effects.forEach(e => {
    if (e.effect.case === 'staticEffect') {
      if (e.effect.value.effect.case === 'fixtureSequence') {
        if (e.effect.value.effect.value.fixtureSequenceId === fixtureSequenceId) {
          e.effect.value.effect.value.fixtureSequenceId = 0;
        }
      }
    } else if (e.effect.case === 'rampEffect') {
      if (e.effect.value.start.case === 'fixtureSequenceMappingStart') {
        if (e.effect.value.start.value.fixtureSequenceId === fixtureSequenceId) {
          e.effect.value.start.value.fixtureSequenceId = 0;
        }
      }
      if (e.effect.value.end.case === 'fixtureSequenceMappingEnd') {
        if (e.effect.value.end.value.fixtureSequenceId === fixtureSequenceId) {
          e.effect.value.end.value.fixtureSequenceId = 0;
        }
      }
    }
  });
}
