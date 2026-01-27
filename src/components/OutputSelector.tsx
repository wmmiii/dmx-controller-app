import { create, equals } from '@bufbuild/protobuf';
import { type Project } from '@dmx-controller/proto/project_pb';
import { JSX, useContext, useMemo } from 'react';

import { ProjectContext } from '../contexts/ProjectContext';
import { getActivePatch } from '../util/projectUtils';

import {
  OutputTarget,
  OutputTargetSchema,
} from '@dmx-controller/proto/output_pb';
import { GROUP_ALL_ID } from '../engine/fixtures/writableDevice';
import styles from './OutputSelector.module.scss';
import { SelectCategory, SelectInput, SelectOption } from './SelectInput';

interface OutputSelectorProps {
  value: OutputTarget | undefined;
  setValue: (value: OutputTarget | undefined) => void;
}

export function OutputSelector({
  value,
  setValue,
}: OutputSelectorProps): JSX.Element {
  const { project } = useContext(ProjectContext);

  const targets: Array<SelectCategory<OutputTarget>> = useMemo(() => {
    if (getActivePatch(project) == null) {
      return [];
    }

    const targets: Array<SelectCategory<OutputTarget>> = [];
    const groups: Array<SelectOption<OutputTarget>> = [
      {
        value: create(OutputTargetSchema, {
          output: {
            case: 'group',
            value: GROUP_ALL_ID,
          },
        }),
        label: '⧉ All Fixtures',
      },
    ];
    for (const [groupId, group] of Object.entries(project.groups)) {
      groups.push({
        value: create(OutputTargetSchema, {
          output: {
            case: 'group',
            value: BigInt(groupId),
          },
        }),
        label: '⧉ ' + group.name,
      });
    }
    targets.push({
      label: 'Groups',
      options: groups,
    });

    const fixtures: Array<SelectOption<OutputTarget>> = [];
    for (const [outputId, output] of Object.entries(
      getActivePatch(project).outputs,
    )) {
      switch (output.output.case) {
        case 'sacnDmxOutput':
        case 'serialDmxOutput':
          for (const [dmxFixtureId, dmxFixture] of Object.entries(
            output.output.value.fixtures,
          )) {
            fixtures.push({
              value: create(OutputTargetSchema, {
                output: {
                  case: 'fixtures',
                  value: {
                    fixtureIds: [
                      {
                        patch: project.activePatch,
                        output: BigInt(outputId),
                        fixture: BigInt(dmxFixtureId),
                      },
                    ],
                  },
                },
              }),
              label: '⧇ ' + dmxFixture.name,
            });
          }
          break;
        case 'wledOutput':
          for (const [wledFixtureId, segment] of Object.entries(
            output.output.value.segments,
          )) {
            fixtures.push({
              value: create(OutputTargetSchema, {
                output: {
                  case: 'fixtures',
                  value: {
                    fixtureIds: [
                      {
                        patch: project.activePatch,
                        output: BigInt(outputId),
                        fixture: BigInt(wledFixtureId),
                      },
                    ],
                  },
                },
              }),
              label: '⧇ ' + segment.name,
            });
          }
          break;
        default:
          throw Error('Unknown output type in output selector!');
      }
    }

    if (fixtures.length > 0) {
      targets.push({
        label: 'Fixtures',
        options: fixtures,
      });
    }

    return targets;
  }, [project]);

  const classes = [];
  if (value === undefined) {
    classes.push(styles.warning);
  }

  return (
    <SelectInput
      className={classes.join(' ')}
      placeholder="Select output"
      value={value}
      onChange={setValue}
      options={targets}
      equals={(a, b) => equals(OutputTargetSchema, a, b)}
    />
  );
}

export function getOutputTargetName(
  project: Project,
  target: OutputTarget | undefined,
) {
  if (target == null) {
    return '<Unset>';
  }

  switch (target.output.case) {
    case 'fixtures':
      const fixtureId = target.output.value.fixtureIds.find(
        (id) => id.patch === project.activePatch,
      );
      if (fixtureId == null) {
        return '<Unset>';
      } else {
        const output =
          getActivePatch(project).outputs[fixtureId.output.toString()].output;
        let name: string;
        switch (output.case) {
          case 'sacnDmxOutput':
          case 'serialDmxOutput':
            name = output.value.fixtures[fixtureId.fixture.toString()].name;
            break;
          case 'wledOutput':
            name = output.value.segments[Number(fixtureId.fixture)].name;
            break;
          default:
            throw Error(
              'Unknown output type in getOutputTargetName! ' + output.case,
            );
        }
        return `⧇ ${name}`;
      }
    case 'group':
      if (target.output.value === GROUP_ALL_ID) {
        return '⧉ All Fixtures';
      }
      return '⧇ ' + project.groups[target.output.value.toString()].name;
    default:
      return '<Unset>';
  }
}
