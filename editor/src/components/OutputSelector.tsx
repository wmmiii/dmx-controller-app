import { useContext, useMemo } from 'react';
import { ProjectContext } from '../contexts/ProjectContext';
import { Project } from '@dmx-controller/proto/project_pb';
import { OutputId, OutputId_FixtureMapping } from '@dmx-controller/proto/output_id_pb';
import { getActiveUniverse } from '../util/projectUtils';
import styles from './OutputSelector.module.scss';
import { GROUP_ALL_ID } from '../engine/fixture';

interface OutputSelectorProps {
  value: OutputId | undefined;
  setValue: (value: OutputId | undefined) => void;
}

export function OutputSelector({ value, setValue }: OutputSelectorProps):
  JSX.Element {
  const { project } = useContext(ProjectContext);

  interface InternalOutput {
    type: 'fixture' | 'group';
    id: bigint;
    name: string;
  }

  const outputs: InternalOutput[] = useMemo(() => {
    if (getActiveUniverse(project) == null) {
      return [];
    }

    const outputs: InternalOutput[] = [];
    outputs.push({
      type: 'group',
      id: GROUP_ALL_ID,
      name: '⧉ All Fixtures',
    });
    for (const [id, group] of Object.entries(project.groups)) {
      outputs.push({
        type: 'group',
        id: BigInt(id),
        name: '⧉ ' + group.name,
      });
    }
    for (const [id, fixture] of Object.entries(getActiveUniverse(project).fixtures)) {
      outputs.push({
        type: 'fixture',
        id: BigInt(id),
        name: '⧇ ' + fixture.name,
      });
    }
    return outputs;
  }, [project]);

  const internalValue: InternalOutput | undefined = useMemo(() => {
    if (value == null) {
      return undefined;
    }
    switch (value.output.case) {
      case 'fixtures':
        const fixtureId = value.output.value.fixtures[project.activeUniverse.toString()];
        if (fixtureId == null) {
          return undefined;
        }
        return {
          type: 'fixture',
          id: fixtureId,
          name: project.universes[project.activeUniverse.toString()].fixtures[fixtureId.toString()].name,
        };
      case 'group':
        let name: string;
        if (value.output.value === GROUP_ALL_ID) {
          name = 'All Fixtures';
        } else {
          name = project.groups[value.output.value.toString()].name;
        }
        return {
          type: 'group',
          id: value.output.value,
          name: name,
        };
      default:
        return undefined;
    }
  }, [value]);

  const classes = [];
  if (internalValue === undefined) {
    classes.push(styles.warning);
  }

  return (
    <select
      className={classes.join(' ')}
      value={String(internalValue?.id) + ' ' + internalValue?.type}
      onChange={(e) => {
        const newInput = e.target.value;

        // Handle case where output is unset.
        if (newInput === ' ') {
          if (value?.output.case === 'fixtures') {
            delete value.output.value.fixtures[project.activeUniverse.toString()];
            setValue(value);
          } else {
            setValue(undefined);
          }
        }

        // Set new output value.
        const [idString, typeString] = newInput.split(' ');
        const id = BigInt(idString);
        const newValue = new OutputId(value);
        if (typeString === 'fixture') {
          if (newValue.output.case === 'fixtures') {
            newValue.output.value.fixtures[project.activeUniverse.toString()] = id;
          } else {
            const fixtures = new OutputId_FixtureMapping();
            fixtures.fixtures[project.activeUniverse.toString()] = id;
            newValue.output = {
              case: 'fixtures',
              value: fixtures,
            };
          }
        } else if (typeString === 'group') {
          newValue.output = {
            case: 'group',
            value: id,
          }
        }
        setValue(newValue);
      }}>
      <option value={' '}>&lt;Unset&gt;</option>
      {outputs.map((d, i) => (
        <option key={i} value={d.id + ' ' + d.type}>
          {d.name}
        </option>
      ))}
    </select>
  );
}

export function getOutputName(project: Project, outputId: OutputId | undefined) {
  if (outputId == null) {
    return '<Unset>';
  }
  const universeId = project.activeUniverse.toString();
  switch (outputId.output.case) {
    case 'fixtures':
      const fixtureId = outputId.output.value.fixtures[universeId];
      if (fixtureId == null) {
        return '<Unset>';
      } else {
        return '⧇ ' + getActiveUniverse(project).fixtures[fixtureId.toString()].name;
      }
    case 'group':
      if (outputId.output.value === GROUP_ALL_ID) {
        return '⧉ All Fixtures';
      }
      return '⧇ ' + project.groups[outputId.output.value.toString()].name;
    default:
      return '<Unset>';
  }
}
