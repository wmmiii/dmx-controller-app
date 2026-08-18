import { useContext } from 'react';

import { TextInput } from '../../components/Input';
import { ProjectContext } from '../../contexts/ProjectContext';
import { getOutput } from '../../util/projectUtils';

import { DmxEditor } from './DmxEditor';
import { OutputFrame } from './OutputFrame';
import { DmxTypeSelector } from './outputTypeSelector';

interface ArtnetEditorProps {
  outputId: bigint;
}

export function ArtnetEditor({ outputId }: ArtnetEditorProps) {
  const { project, save } = useContext(ProjectContext);

  const output = getOutput(project, outputId);
  if (output.output.case !== 'artnetDmxOutput') {
    throw new Error('Passed non Art-Net output ID into ArtnetEditor.');
  }

  const artnetOutput = output.output.value;

  return (
    <OutputFrame
      outputEnabled={output.enabled}
      setOutputEnabled={(enabled) => {
        output.enabled = enabled;
        save(`${enabled ? 'Enabled' : 'Disabled'} output "${output.name}".`);
      }}
      fps={output.fps}
      setFps={(fps) => {
        output.fps = fps;
        save(`Set FPS for ${output.name} to ${fps}.`);
      }}
      settings={
        <>
          <label>
            <span>Output Type</span>
            <DmxTypeSelector output={output} />
          </label>
          <label>
            <span>IP Address</span>
            <TextInput
              value={artnetOutput.ipAddress}
              onChange={(ipAddress) => {
                artnetOutput.ipAddress = ipAddress;
                save(
                  `Update address of Art-Net device ${output.name} to ${ipAddress}.`,
                );
              }}
            />
          </label>
        </>
      }
    >
      <DmxEditor outputId={outputId} />
    </OutputFrame>
  );
}
