import { create } from '@bufbuild/protobuf';
import {
  OutputIdSchema,
  OutputId_FixtureMappingSchema,
  type OutputId,
} from '@dmx-controller/proto/output_id_pb';
import { Project } from '@dmx-controller/proto/project_pb';

import { getActiveUniverse } from '../util/projectUtils';

import { GROUP_ALL_ID } from './fixture';

interface GroupMember {
  id: OutputId;
  name: string;
}

/**
 * Returns fixtures and groups that may be added to the provided group.
 */
export function getApplicableMembers(
  project: Project,
  groupId: bigint,
): GroupMember[] {
  const group = project.groups[groupId.toString()];
  const members: GroupMember[] = [];

  const depMap: { [key: string]: Set<bigint> } = {};
  for (const idString in project.groups) {
    const id = BigInt(idString);
    if (group.groups.indexOf(id) > -1) {
      continue;
    }
    const deps = recursivelyGetDepMap(id, project, depMap);
    if (!deps.has(groupId)) {
      members.push({
        id: create(OutputIdSchema, {
          output: {
            case: 'group',
            value: id,
          },
        }),
        name: project.groups[id.toString()].name,
      });
    }
  }

  const existingFixtures = getAllFixtures(project, groupId);
  members.push(
    ...Object.keys(
      project.universes[project.activeUniverse.toString()].fixtures,
    )
      .map((id) => BigInt(id))
      .filter((id) => !existingFixtures.includes(id))
      .map((id) => {
        const mapping = create(OutputId_FixtureMappingSchema, {
          fixtures: {
            [project.activeUniverse.toString()]: id,
          },
        });
        return {
          id: create(OutputIdSchema, {
            output: {
              case: 'fixtures',
              value: mapping,
            },
          }),
          name: project.universes[project.activeUniverse.toString()].fixtures[
            id.toString()
          ].name,
        };
      }),
  );

  return members;
}

export function getAllFixtures(project: Project, groupId: bigint): bigint[] {
  if (groupId === GROUP_ALL_ID) {
    return Object.entries(getActiveUniverse(project).fixtures)
      .sort((a, b) => a[1].channelOffset - b[1].channelOffset)
      .map((e) => BigInt(e[0]));
  }
  const group = project.groups[groupId.toString()];
  if (!group) {
    return [];
  }

  const fixtures = new Set(
    group.fixtures?.[project.activeUniverse.toString()]?.fixtures,
  );
  for (const g of group.groups) {
    getAllFixtures(project, g).forEach((f) => fixtures.add(f));
  }

  return Array.from(fixtures);
}

function recursivelyGetDepMap(
  id: bigint,
  project: Project,
  depMap: { [key: string]: Set<bigint> },
): Set<bigint> {
  if (depMap[id.toString()] != null) {
    return depMap[id.toString()];
  }

  const group = project.groups[id.toString()];
  if (group == null) {
    return new Set<bigint>();
  }

  depMap[id.toString()] = new Set<bigint>();
  depMap[id.toString()].add(id);

  const addRecursive = (dep: bigint) => {
    recursivelyGetDepMap(dep, project, depMap).forEach((d) =>
      depMap[id.toString()].add(d),
    );
  };

  for (let g of group.groups) {
    addRecursive(g);
  }

  return depMap[id.toString()];
}
