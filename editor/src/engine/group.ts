import { Project } from "@dmx-controller/proto/project_pb";

interface GroupMember {
  id: number;
  type: 'fixture' | 'group';
  name: string;
}

/**
 * Returns fixtures and groups that may be added to the provided group.
 */
export function getApplicableMembers(project: Project, groupId: number): GroupMember[] {
  const group = project.physicalFixtureGroups[groupId];
  const members: GroupMember[] = [];

  const depMap: { [key: number]: Set<number> } = {};
  for (const idString in project.physicalFixtureGroups) {
    const id = parseInt(idString);
    if (group.physicalFixtureGroupIds.indexOf(id) > -1) {
      continue;
    }
    const deps = recursivelyGetDepMap(id, project, depMap)
    if (!deps.has(groupId)) {
      members.push({
        id: id,
        type: 'group',
        name: project.physicalFixtureGroups[id].name,
      });
    }
  }

  const existingFixtures = getAllFixtures(project, groupId);
  members.push(...Object.keys(project.physicalFixtures)
    .map((id) => parseInt(id))
    .filter((id) => !existingFixtures.includes(id))
    .map((id) => ({
      id: id,
      type: 'fixture',
      name: project.physicalFixtures[id].name,
    } as GroupMember)));

  return members;
}

export function getAllFixtures(project: Project, groupId: number): number[] {
  const group = project.physicalFixtureGroups[groupId];
  if (!group) {
    return [];
  }

  const fixtures = new Set<number>(group.physicalFixtureIds);
  for (const g of group.physicalFixtureGroupIds) {
    getAllFixtures(project, g).forEach(f => fixtures.add(f));
  }

  return Array.from(fixtures);
}

function recursivelyGetDepMap(id: number, project: Project, depMap: { [key: number]: Set<number> }): Set<number> {
  if (depMap[id] != null) {
    return depMap[id];
  }

  const group = project.physicalFixtureGroups[id];
  if (group == null) {
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

  for (let g of group.physicalFixtureGroupIds) {
    addRecursive(g);
  }

  return depMap[id];
}