import { create, toJsonString } from '@bufbuild/protobuf';
import {
  OutputSchema,
  OutputTargetSchema,
  TargetGroupSchema,
} from '@dmx-controller/proto/output_pb';
import { randomUint64 } from '../util/numberUtils';
import { createNewProject } from '../util/projectUtils';
import { addToGroup, getApplicableMembers } from './group';

describe('group', () => {
  describe('addToGroup', () => {
    it('Should remove redundant members', () => {
      const groupAId = randomUint64();
      const groupBId = randomUint64();
      const outputId = randomUint64();
      const fixtureId = randomUint64();
      const project = createNewProject();
      project.patches[project.activePatch.toString()].outputs[
        outputId.toString()
      ] = create(OutputSchema, {
        output: {
          case: 'serialDmxOutput',
          value: {
            fixtures: {
              [fixtureId.toString()]: {
                name: 'test fixture',
              },
            },
          },
        },
      });
      project.groups = {
        [groupAId.toString()]: create(TargetGroupSchema, {
          targets: [
            {
              output: {
                case: 'fixtures',
                value: {
                  fixtureIds: [
                    {
                      patch: project.activePatch,
                      output: outputId,
                      fixture: fixtureId,
                    },
                  ],
                },
              },
            },
          ],
        }),
        [groupBId.toString()]: create(TargetGroupSchema, {
          targets: [
            {
              output: {
                case: 'fixtures',
                value: {
                  fixtureIds: [
                    {
                      patch: project.activePatch,
                      output: outputId,
                      fixture: fixtureId,
                    },
                  ],
                },
              },
            },
          ],
        }),
      };
      addToGroup(
        project,
        groupAId,
        create(OutputTargetSchema, {
          output: {
            case: 'group',
            value: groupBId,
          },
        }),
      );
      expect(project.groups[groupAId.toString()].targets.length).toBe(1);
      expect(
        toJsonString(
          OutputTargetSchema,
          project.groups[groupAId.toString()].targets[0],
        ),
      ).toBe(
        toJsonString(
          OutputTargetSchema,
          create(OutputTargetSchema, {
            output: {
              case: 'group',
              value: groupBId,
            },
          }),
        ),
      );
    });
  });

  describe('getApplicableMembers', () => {
    it('should not return self', () => {
      const groupId = randomUint64();
      const project = createNewProject();
      project.groups = {
        [groupId.toString()]: create(TargetGroupSchema, {
          targets: [],
        }),
      };
      const members = getApplicableMembers(project, groupId);
      expect(members.length).toEqual(0);
    });

    it('should not return cyclical members', () => {
      const groupAId = randomUint64();
      const groupBId = randomUint64();
      const groupCId = randomUint64();
      const project = createNewProject();
      project.groups = {
        [groupAId.toString()]: create(TargetGroupSchema, {
          targets: [
            {
              output: {
                case: 'group',
                value: groupBId,
              },
            },
          ],
        }),
        [groupBId.toString()]: create(TargetGroupSchema, {
          targets: [
            {
              output: {
                case: 'group',
                value: groupCId,
              },
            },
          ],
        }),
        [groupCId.toString()]: create(TargetGroupSchema, {
          targets: [],
        }),
      };
      const members = getApplicableMembers(project, groupCId);
      expect(members.length).toEqual(0);
    });

    it('should not return transitive fixture members', () => {
      const groupAId = randomUint64();
      const groupBId = randomUint64();
      const outputId = randomUint64();
      const fixtureId = randomUint64();
      const project = createNewProject();
      project.patches[project.activePatch.toString()].outputs[
        outputId.toString()
      ] = create(OutputSchema, {
        output: {
          case: 'serialDmxOutput',
          value: {
            fixtures: {
              [fixtureId.toString()]: {
                name: 'test fixture',
              },
            },
          },
        },
      });
      project.groups = {
        [groupAId.toString()]: create(TargetGroupSchema, {
          targets: [
            {
              output: {
                case: 'fixtures',
                value: {
                  fixtureIds: [
                    {
                      patch: project.activePatch,
                      output: outputId,
                      fixture: fixtureId,
                    },
                  ],
                },
              },
            },
          ],
        }),
        [groupBId.toString()]: create(TargetGroupSchema, {
          targets: [
            {
              output: {
                case: 'group',
                value: groupAId,
              },
            },
          ],
        }),
      };
      const members = getApplicableMembers(project, groupBId);
      expect(members.length).toEqual(0);
    });
  });
});
