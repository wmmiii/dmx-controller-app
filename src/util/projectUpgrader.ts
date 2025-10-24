import { type Project } from '@dmx-controller/proto/project_pb';

export default function upgradeProject(p: Project): void {
  Object.values(p.patches)
    .flatMap((p) => Object.values(p.outputs))
    .forEach((o) => {
      if (o.output.case === 'sacnDmxOutput') {
        o.output.value.universe = 1;
      }
    });
}
