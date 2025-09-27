import { create } from '@bufbuild/protobuf';
import {
  PhysicalWledSegment,
  PhysicalWledSegmentSchema,
  WledOutput,
} from '@dmx-controller/proto/wled_pb';
import { useCallback, useContext } from 'react';
import { Button } from '../../components/Button';
import { TextInput } from '../../components/Input';
import { ProjectContext } from '../../contexts/ProjectContext';
import { getOutput } from '../../util/projectUtils';

interface WledEditorProps {
  outputId: bigint;
}

export function WledEditor({ outputId }: WledEditorProps) {
  const { project, save } = useContext(ProjectContext);

  const output = getOutput(project, outputId);
  const wledOutput = output.output.value as WledOutput;

  const syncDevice = useCallback(async () => {
    const response = await fetch(`http://${wledOutput.ipAddress}/json`);
    if (response.ok) {
      const json = await response.json();
      const newSegments: { [key: string]: PhysicalWledSegment } = {};
      for (let i = 0; i < json['state']['seg'].length; ++i) {
        const jsonSegment = json['state']['seg'][i];
        newSegments[jsonSegment['id']] = create(PhysicalWledSegmentSchema, {
          name: jsonSegment['n'] || `Segment ${i}`,
        });
      }

      wledOutput.segments = newSegments;
      save(`Sync WLED device ${output.name}.`);
    }
  }, [wledOutput]);

  return (
    <div>
      <label>
        IP Address
        <TextInput
          value={wledOutput.ipAddress}
          onChange={(ipAddress) => {
            wledOutput.ipAddress = ipAddress;
            save(
              `Update address of WLED device ${output.name} to ${ipAddress}.`,
            );
          }}
        />
      </label>
      <Button onClick={syncDevice}>Sync</Button>
      <ol>
        {Object.entries(wledOutput.segments).map(([id, s]) => (
          <li key={id}>{s.name}</li>
        ))}
      </ol>
    </div>
  );
}
