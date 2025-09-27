import {
  create,
  equals,
  fromJsonString,
  toJsonString,
} from '@bufbuild/protobuf';
import { Project } from '@dmx-controller/proto/project_pb';

import {
  OutputTarget,
  OutputTargetSchema,
  QualifiedFixtureId,
  QualifiedFixtureIdSchema,
} from '@dmx-controller/proto/output_pb';
import { getActivePatch } from '../util/projectUtils';
import { GROUP_ALL_ID } from './fixtures/writableDevice';

/**
 *
 * @param project
 * @param groupId
 * @returns
 */
export function addToGroup(
  project: Project,
  groupId: bigint,
  target: OutputTarget,
) {
  const group = project.groups[groupId.toString()];

  // First add new target to the group.
  group.targets.push(target);

  // Next, collect all fixtures based on group;
  const fixtureMembers: QualifiedFixtureId[] = [];

  const frontier: bigint[] = group.targets
    .filter((t) => t.output.case === 'group')
    .map((t) => t.output.value as bigint);
  while (frontier.length != 0) {
    const groupId = frontier.pop()!;
    const group = project.groups[groupId.toString()];
    for (const output of group.targets.map((t) => t.output)) {
      switch (output.case) {
        case 'fixtures':
          for (const fixture of output.value.fixtureIds) {
            fixtureMembers.push(fixture);
          }
          break;
        case 'group':
          frontier.push(output.value);
          break;
        default:
          throw Error('Unknown output type in addAllFixtures!');
      }
    }
  }

  // Finally, remove any fixtures that are also included in groups.
  group.targets = group.targets.filter((t) => {
    switch (t.output.case) {
      case 'fixtures':
        for (const id of t.output.value.fixtureIds) {
          if (
            fixtureMembers.find((member) =>
              equals(QualifiedFixtureIdSchema, member, id),
            )
          ) {
            return false;
          }
        }
        return true;
      case 'group':
        return true;
      default:
        throw Error('Unknown output type in addToGroup!');
    }
  });
}

/**
 * Returns fixtures and groups that may be added to the provided group.
 */
export function getApplicableMembers(
  project: Project,
  groupId: bigint,
): OutputTarget[] {
  const groupMembers: bigint[] = [groupId];
  const fixtureMembers: QualifiedFixtureId[] = [];

  // First collect all existing members of the group.
  const frontier: bigint[] = [groupId];
  while (frontier.length != 0) {
    const groupId = frontier.pop()!;
    const group = project.groups[groupId.toString()];
    for (const output of group.targets.map((t) => t.output)) {
      switch (output.case) {
        case 'fixtures':
          for (const fixture of output.value.fixtureIds) {
            if (fixture.patch === project.activePatch) {
              fixtureMembers.push(fixture);
            }
          }
          break;
        case 'group':
          groupMembers.push(output.value);
          frontier.push(output.value);
          break;
        default:
          throw Error('Unknown output type in addAllFixtures!');
      }
    }
  }

  // Next collect all output targets not in the group.
  const applicable: OutputTarget[] = [];
  for (const testGroupId of Object.keys(project.groups).map(BigInt)) {
    if (
      groupMembers.indexOf(testGroupId) == -1 &&
      !isTransitiveMemberOfGroup(project, groupId, testGroupId)
    ) {
      applicable.push(
        create(OutputTargetSchema, {
          output: {
            case: 'group',
            value: testGroupId,
          },
        }),
      );
    }
  }
  for (const [outputId, output] of Object.entries(
    getActivePatch(project).outputs,
  )) {
    switch (output.output.case) {
      case 'serialDmxOutput':
        {
          const dmxOutput = output.output.value;
          for (const fixtureId of Object.keys(dmxOutput.fixtures)) {
            if (
              fixtureMembers.find(
                (m) =>
                  m.output.toString() === outputId &&
                  m.fixture.toString() === fixtureId,
              ) == null
            ) {
              applicable.push(
                create(OutputTargetSchema, {
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
              );
            }
          }
        }
        break;
      case 'wledOutput':
        const wledOutput = output.output.value;
        for (const segmentId of Object.keys(wledOutput.segments)) {
          applicable.push(
            create(OutputTargetSchema, {
              output: {
                case: 'fixtures',
                value: {
                  fixtureIds: [
                    {
                      patch: project.activePatch,
                      output: BigInt(outputId),
                      fixture: BigInt(segmentId),
                    },
                  ],
                },
              },
            }),
          );
        }
        break;
      default:
        throw Error(
          `Unknown output when trying to get all group members! ${output.output.case}`,
        );
    }
  }

  return applicable;
}

function isTransitiveMemberOfGroup(
  project: Project,
  potentialMember: bigint,
  test: bigint,
) {
  const frontier: bigint[] = [test];
  while (frontier.length != 0) {
    const groupId = frontier.pop()!;
    const group = project.groups[groupId.toString()];
    if (
      group.targets.find(
        (t) => t.output.case === 'group' && t.output.value === potentialMember,
      )
    ) {
      return true;
    } else {
      frontier.push(
        ...group.targets
          .filter((t) => t.output.case === 'group')
          .map((t) => t.output.value as bigint),
      );
    }
  }
  return false;
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
        case 'serialDmxOutput':
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
        case 'wledOutput':
          for (const segmentId of Object.keys(output.output.value.segments)) {
            fixtureIds.add(
              toJsonString(
                QualifiedFixtureIdSchema,
                create(QualifiedFixtureIdSchema, {
                  patch: project.activePatch,
                  output: BigInt(outputId),
                  fixture: BigInt(segmentId),
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
  for (const scene of Object.values(project.scenes)) {
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
