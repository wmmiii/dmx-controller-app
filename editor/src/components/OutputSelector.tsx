import React, { useContext, useMemo } from 'react';
import { ProjectContext } from '../contexts/ProjectContext';

export interface OutputDescription {
  id: number;
  type: 'fixture' | 'group';
}

interface OutputSelectorProps {
  value: OutputDescription;
  setValue: (value: OutputDescription) => void;
}

export function OutputSelector({ value, setValue }: OutputSelectorProps):
  JSX.Element {
  const { project } = useContext(ProjectContext);

  interface InternalOutputDescription extends OutputDescription {
    name: string;
  }

  const devices: InternalOutputDescription[] = useMemo(() => {
    const devices: InternalOutputDescription[] = [];
    for (const [id, group] of Object.entries(project.physicalFixtureGroups)) {
      devices.push({
        id: parseInt(id),
        name: group.name,
        type: 'group',
      });
    }
    for (const [id, fixture] of Object.entries(project.physicalFixtures)) {
      devices.push({
        id: parseInt(id),
        name: fixture.name,
        type: 'fixture',
      });
    }
    return devices;
  }, [project]);

  return (
    <select
      value={value?.id + ' ' + value?.type}
      onChange={(e) => {
        const value = e.target.value;
        const parts = value.split(' ');
        setValue({
          id: parseInt(parts[0]),
          type: parts[1] as OutputDescription['type'],
        });
      }}>
      {devices.map((d, i) => (
        <option key={i} value={d.id + ' ' + d.type}>
          {d.name}
        </option>
      ))}
    </select>
  );
}
