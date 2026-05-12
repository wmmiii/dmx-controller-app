import { create } from '@bufbuild/protobuf';
import { DdpOutput } from '@dmx-controller/proto/ddp_pb';
import { Mapping2DSchema } from '@dmx-controller/proto/spatial_mapping_pb';
import { useContext } from 'react';
import { NumberInput, TextInput } from '../../components/Input';
import { ProjectContext } from '../../contexts/ProjectContext';
import { getOutput } from '../../util/projectUtils';
import { OutputFrame } from './OutputFrame';

interface DdpEditorProps {
  outputId: bigint;
}

export function DdpEditor({ outputId }: DdpEditorProps) {
  const { project, save } = useContext(ProjectContext);

  const output = getOutput(project, outputId);
  const ddpOutput = output.output.value as DdpOutput;

  // Ensure mapping_2d exists
  if (!ddpOutput.mapping2d) {
    ddpOutput.mapping2d = create(Mapping2DSchema, {
      width: 1,
      height: 1,
      samples: [],
    });
  }

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
            <span>IP Address</span>
            <TextInput
              value={ddpOutput.ipAddress}
              onChange={(ipAddress) => {
                ddpOutput.ipAddress = ipAddress;
                save(
                  `Update address of DDP device ${output.name} to ${ipAddress}.`,
                );
              }}
            />
          </label>
          <label>
            <span>Width</span>
            <NumberInput
              mode="integer"
              value={ddpOutput.mapping2d.width}
              onChange={(width) => {
                ddpOutput.mapping2d!.width = width;
                save(`Set DDP ${output.name} width to ${width}.`);
              }}
            />
          </label>
          <label>
            <span>Height</span>
            <NumberInput
              mode="integer"
              value={ddpOutput.mapping2d.height}
              onChange={(height) => {
                ddpOutput.mapping2d!.height = height;
                save(`Set DDP ${output.name} height to ${height}.`);
              }}
            />
          </label>
        </>
      }
    >
      <p>
        Total pixels: {ddpOutput.mapping2d.width * ddpOutput.mapping2d.height}
      </p>
    </OutputFrame>
  );
}
