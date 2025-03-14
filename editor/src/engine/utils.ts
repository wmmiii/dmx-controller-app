import { ChannelTypes, DmxUniverse } from "./fixture";
import { Project } from "@dmx-controller/proto/project_pb";
import { getActiveUniverse } from "../util/projectUtils";

export function interpolateUniverses(universe: DmxUniverse, t: number, start: DmxUniverse, end: DmxUniverse) {
  // First do a dumb interpolation of all the channels to set coarse values.
  for (let i = 0; i < universe.length; ++i) {
    universe[i] = start[i] * (1 - t) + end[i] * t;
  }
}

export function universeToUint8Array(project: Project, universe: DmxUniverse) {
  const out = new Uint8Array(512);
  for (let i = 0; i < 512; ++i) {
    out[i] = Math.floor(universe[i]);
  }

  Object.values(getActiveUniverse(project).fixtures)
    .forEach(f => {
      const d = project.fixtureDefinitions[f.fixtureDefinitionId];
      if (d == null) {
        return;
      }
      for (const channel of Object.entries(d.channels)) {
        const type = channel[1].type;
        if (type.indexOf('-fine') > -1) {
          const fineIndex = parseInt(channel[0]) + f.channelOffset - 1;
          const coarseType = type.substring(0, type.length - 5) as ChannelTypes;
          const courseEntry = Object.entries(d.channels).find(c => c[1].type === coarseType);
          if (courseEntry == null) {
            continue;
          }
          const coarseIndex = parseInt(courseEntry[0]) + f.channelOffset - 1;
          const coarseValue = universe[coarseIndex];
          out[fineIndex] = Math.floor(coarseValue * 255) % 255;
        }
      }
    });

  return out;
}
