import { Project } from "@dmx-controller/proto/project_pb";
import { ChannelTypes, DmxUniverse } from "./fixture";

export function interpolateUniverses(universe: DmxUniverse, project: Project, t: number, start: DmxUniverse, end: DmxUniverse) {
  // First do a dumb interpolation of all the channels to set coarse values.
  for (let i = 0; i < universe.length; ++i) {
    universe[i] = Math.floor(start[i] * (1 - t) + end[i] * t);
  }

  Object.values(project.physicalFixtures).forEach(f => {
    const d = project.fixtureDefinitions[f.fixtureDefinitionId];
    for (const channel of Object.entries(d.channels)) {
      const type = channel[1].type
      if (type.indexOf('-fine') > -1) {

        const coarseType = type.substring(0, type.length - 5) as ChannelTypes;
        const coarseIndex = parseInt(Object.entries(d.channels).find(c => c[1].type === coarseType)[0]);
        const coarseValue = start[coarseIndex] * (1 - t) + end[coarseIndex] * t;
        universe[parseInt(channel[0])] = Math.floor(coarseValue * 255) % 255;
      }
    }
  });
}