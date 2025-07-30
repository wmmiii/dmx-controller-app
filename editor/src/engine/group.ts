import { create, fromJsonString, toJsonString } from '@bufbuild/protobuf';
import { Project } from '@dmx-controller/proto/project_pb';

import {
  OutputTarget,
  OutputTargetSchema,
  QualifiedFixtureId,
  QualifiedFixtureIdSchema,
} from '@dmx-controller/proto/output_pb';
import { getActivePatch } from '../util/projectUtils';
import { GROUP_ALL_ID } from './fixtures/writableDevice';

interface GroupMember {
  id: OutputTarget;
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

  const groupMembers: bigint[] = [];
  const fixtureMembers: QualifiedFixtureId[] = [];

  // First collect all existing members of the group.
  for (const outputTarget of group.targets) {
    switch (outputTarget.output.case) {
      case 'fixtures': {
        const fixtures = outputTarget.output.value;
        const fixtureId = fixtures.fixtureIds.find(
          (id) => id.patch === project.activePatch,
        );
        if (fixtureId == null) {
          continue;
        }
        fixtureMembers.push(fixtureId);
        break;
      }
      case 'group': {
        addAllGroups(project, outputTarget.output.value, groupMembers);
        break;
      }
      default:
        throw Error('Unknown type in output ID!');
    }
  }

  // Next collect all output targets not in the group.
  const applicable: GroupMember[] = [];
  for (const groupId of Object.keys(project.groups).map(BigInt)) {
    if (groupMembers.indexOf(groupId) != -1) {
      const name = project.groups[groupId.toString()].name;
      applicable.push({
        id: create(OutputTargetSchema, {
          output: {
            case: 'group',
            value: groupId,
          },
        }),
        name: name,
      });
    }
  }
  for (const [outputId, output] of Object.entries(
    getActivePatch(project).outputs,
  )) {
    switch (output.output.case) {
      case 'SerialDmxOutput': {
        const dmxOutput = output.output.value;
        for (const [fixtureId, fixture] of Object.entries(dmxOutput.fixtures)) {
          if (
            fixtureMembers.find(
              (m) =>
                m.output.toString() === outputId &&
                m.fixture.toString() === fixtureId,
            ) == null
          ) {
            applicable.push({
              id: create(OutputTargetSchema, {
                output: {
                  case: 'fixtures',
                  value: {
                    fixtureIds: [
                      {
                        patch: project.activePatch,
                        output: BigInt(outputId),
                        fixture: BigInt(fixtureId),
                      },
                    ],
                  },
                },
              }),
              name: fixture.name,
            });
          }
        }
      }
    }
  }

  return applicable;
}

export function addAllGroups(
  project: Project,
  groupId: bigint,
  members: bigint[],
) {
  const frontier: bigint[] = [groupId];
  while (frontier.length != 0) {
    const groupId = frontier.pop()!;
    const group = project.groups[groupId.toString()];
    members.push(groupId);
    frontier.push(
      ...group.targets
        .filter((t) => t.output.case === 'group')
        .map((t) => t.output.value as bigint),
    );
  }
}

export function getAllFixtures(
  project: Project,
  groupId: bigint,
): QualifiedFixtureId[] {
  const fixtureIds: Set<string> = new Set();

  if (groupId === GROUP_ALL_ID) {
    for (const [outputId, output] of Object.entries(
      getActivePatch(project).outputs,
    )) {
      switch (output.output.case) {
        case 'SerialDmxOutput':
          for (const fixtureId of Object.keys(output.output.value.fixtures)) {
            fixtureIds.add(
              toJsonString(
                QualifiedFixtureIdSchema,
                create(QualifiedFixtureIdSchema, {
                  patch: project.activePatch,
                  output: BigInt(outputId),
                  fixture: BigInt(fixtureId),
                }),
              ),
            );
          }
          break;
        default:
          throw Error(
            `Unknown output type in getAllFixtures! ${output.output.case}`,
          );
      }
    }
  } else {
    const frontier: bigint[] = [groupId];
    while (frontier.length > 0) {
      const groupId = frontier.pop();
      const group = project.groups[groupId!.toString()];
      for (const t of group.targets ?? []) {
        switch (t.output.case) {
          case 'fixtures':
            const fixtureId = t.output.value.fixtureIds.find(
              (f) => f.patch === project.activePatch,
            );
            if (fixtureId) {
              fixtureIds.add(toJsonString(QualifiedFixtureIdSchema, fixtureId));
            }
            break;
          case 'group':
            frontier.push(t.output.value);
            break;
          default:
            throw Error('Unknown output type in getAllFixtures!');
        }
      }
    }
  }

  return [...fixtureIds].map((json) =>
    fromJsonString(QualifiedFixtureIdSchema, json),
  );
}

export function deleteTargetGroup(project: Project, groupId: bigint) {
  const deleteFromOutputTarget = (hasTarget: {
    outputTarget?: OutputTarget;
  }) => {
    if (
      hasTarget.outputTarget?.output.case === 'group' &&
      hasTarget.outputTarget.output.value === groupId
    ) {
      delete hasTarget.outputTarget;
    }
  };

  // Remove group from scenes.
  for (const scene of project.scenes) {
    for (const tile of scene.tileMap) {
      switch (tile.tile?.description.case) {
        case 'effectGroup':
          for (const channel of tile.tile.description.value.channels) {
            deleteFromOutputTarget(channel);
            if (
              channel.outputTarget?.output.case === 'group' &&
              channel.outputTarget.output.value === groupId
            ) {
              delete channel.outputTarget;
            }
          }
          break;
      }
    }
  }

  // Remove group from shows.
  for (const show of project.shows) {
    for (const lightTracks of show.lightTracks) {
      deleteFromOutputTarget(lightTracks);
    }
  }

  // Finally, delete the group.
  delete project.groups[groupId.toString()];
}
