import { create } from '@bufbuild/protobuf';
import { PhysicalDmxFixture } from '@dmx-controller/proto/dmx_pb';
import {
  ArtnetDmxOutputSchema,
  Output,
  SacnDmxOutputSchema,
  SerialDmxOutputSchema,
} from '@dmx-controller/proto/output_pb';
import { useContext } from 'react';

import { Select } from '../../components/Select';
import { ProjectContext } from '../../contexts/ProjectContext';

type DmxOutputCase = 'serialDmxOutput' | 'sacnDmxOutput' | 'artnetDmxOutput';

function buildDmxOutput(
  newCase: DmxOutputCase,
  fixtures: { [key: string]: PhysicalDmxFixture },
  ipAddress: string,
  universe: number,
): Output['output'] {
  switch (newCase) {
    case 'serialDmxOutput':
      return {
        case: 'serialDmxOutput',
        value: create(SerialDmxOutputSchema, { fixtures }),
      };
    case 'sacnDmxOutput':
      return {
        case: 'sacnDmxOutput',
        value: create(SacnDmxOutputSchema, { fixtures, ipAddress, universe }),
      };
    case 'artnetDmxOutput':
      return {
        case: 'artnetDmxOutput',
        value: create(ArtnetDmxOutputSchema, { fixtures, ipAddress, universe }),
      };
  }
}

interface DmxTypeSelectorProps {
  output: Output;
}

export function DmxTypeSelector({ output }: DmxTypeSelectorProps) {
  const { save } = useContext(ProjectContext);

  if (
    output.output.case !== 'serialDmxOutput' &&
    output.output.case !== 'sacnDmxOutput' &&
    output.output.case !== 'artnetDmxOutput'
  ) {
    throw new Error('DmxTypeSelector used on a non-DMX output.');
  }

  const currentCase = output.output.case;
  const fixtures = output.output.value.fixtures;
  const ipAddress =
    currentCase === 'sacnDmxOutput' || currentCase === 'artnetDmxOutput'
      ? output.output.value.ipAddress
      : '0.0.0.0';
  const universe =
    currentCase === 'sacnDmxOutput' || currentCase === 'artnetDmxOutput'
      ? output.output.value.universe
      : 1;

  return (
    <Select
      value={currentCase}
      onChange={(newCase) => {
        if (newCase === currentCase) {
          return;
        }
        output.output = buildDmxOutput(newCase, fixtures, ipAddress, universe);
        save(`Change output type of ${output.name} to ${newCase}.`);
      }}
      options={[
        { value: 'serialDmxOutput', label: 'Serial' },
        { value: 'sacnDmxOutput', label: 'sACN' },
        { value: 'artnetDmxOutput', label: 'Art-Net' },
      ]}
    />
  );
}
