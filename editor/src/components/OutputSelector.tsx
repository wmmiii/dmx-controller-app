import { clone, create } from '@bufbuild/protobuf';
import { type Project } from '@dmx-controller/proto/project_pb';
import { JSX, useContext, useMemo } from 'react';

import { ProjectContext } from '../contexts/ProjectContext';
import { getActivePatch } from '../util/projectUtils';

import {
  OutputTarget,
  OutputTarget_FixtureMapping,
  OutputTargetSchema,
  QualifiedFixtureIdSchema,
} from '@dmx-controller/proto/output_pb';
import { GROUP_ALL_ID } from '../engine/fixtures/writableDevice';
import styles from './OutputSelector.module.scss';

interface OutputSelectorProps {
  value: OutputTarget | undefined;
  setValue: (value: OutputTarget | undefined) => void;
}

export function OutputSelector({
  value,
  setValue,
}: OutputSelectorProps): JSX.Element {
  const { project } = useContext(ProjectContext);

  interface InternalOutput {
    target: OutputTarget;
    name: string;
  }

  const allTargets: InternalOutput[] = useMemo(() => {
    if (getActivePatch(project) == null) {
      return [];
    }

    const targets: InternalOutput[] = [];
    targets.push({
      target: create(OutputTargetSchema, {
        output: {
          case: 'group',
          value: GROUP_ALL_ID,
        },
      }),
      name: '⧉ All Fixtures',
    });
    for (const [groupId, group] of Object.entries(project.groups)) {
      targets.push({
        target: create(OutputTargetSchema, {
          output: {
            case: 'group',
            value: BigInt(groupId),
          },
        }),
        name: '⧉ ' + group.name,
      });
    }

    for (const [outputId, output] of Object.entries(
      getActivePatch(project).outputs,
    )) {
      switch (output.output.case) {
        case 'SerialDmxOutput':
          for (const [dmxFixtureId, dmxFixture] of Object.entries(
            output.output.value.fixtures,
          )) {
            targets.push({
              target: create(OutputTargetSchema, {
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
              name: '⧇ ' + dmxFixture.name,
            });
          }
      }
    }
    return targets;
  }, [project]);

  const internalIndex: number = useMemo(() => {
    if (value == null) {
      return -1;
    }
    return allTargets.findIndex((t) => {
      if (t.target.output.case !== value.output.case) {
        return false;
      }

      switch (t.target.output.case) {
        case 'fixtures':
          const fixtures = value.output.value as OutputTarget_FixtureMapping;
          const fixtureId = t.target.output.value.fixtureIds[0];
          return (
            fixtures.fixtureIds.find((i) => {
              return (
                fixtureId.patch === i.patch &&
                fixtureId.output === i.output &&
                fixtureId.fixture === i.fixture
              );
            }) != null
          );
        case 'group':
          return t.target.output.value === (value.output.value as bigint);
        default:
          throw Error(
            'Unknown target output type in OutputSelector while calculating all targets!',
          );
      }
    });
  }, [value, allTargets]);

  const classes = [];
  if (internalIndex === -1) {
    classes.push(styles.warning);
  }

  return (
    <select
      className={classes.join(' ')}
      value={internalIndex}
      onChange={(e) => {
        const newIndex = parseInt(e.target.value);

        // Handle case where output is unset.
        if (newIndex === -1) {
          if (value?.output.case === 'fixtures') {
            value.output.value.fixtureIds =
              value.output.value.fixtureIds.filter(
                (id) => id.patch !== project.activePatch,
              );
            setValue(value);
          } else {
            setValue(undefined);
          }
        }

        // Set new output value.
        const newTarget = allTargets[newIndex];
        let newValue: OutputTarget;
        switch (newTarget.target.output.case) {
          case 'fixtures':
            const newFixtureId = clone(
              QualifiedFixtureIdSchema,
              newTarget.target.output.value.fixtureIds[0],
            );
            if (value != null && value.output.case === 'fixtures') {
              value.output.value.fixtureIds.push(newFixtureId);
              newValue = value;
            } else {
              newValue = create(OutputTargetSchema, {
                output: {
                  case: 'fixtures',
                  value: {
                    fixtureIds: [newFixtureId],
                  },
                },
              });
            }
            break;
          case 'group':
            newValue = create(OutputTargetSchema, {
              output: {
                case: 'group',
                value: newTarget.target.output.value,
              },
            });
            break;
          default:
            throw Error(
              'Unknown target output type in OutputSelector while setting new target!',
            );
        }
        setValue(newValue);
      }}
    >
      <option value={-1}>&lt;Unset&gt;</option>
      {allTargets.map((d, i) => (
        <option key={i} value={i}>
          {d.name}
        </option>
      ))}
    </select>
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
          case 'SerialDmxOutput':
            name = output.value.fixtures[fixtureId.fixture.toString()].name;
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
