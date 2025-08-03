import { Project } from '@dmx-controller/proto/project_pb';
import { getOutput } from '../../util/projectUtils';
import { WritableOutput } from '../context';
import { getDmxWritableOutput } from './dmxOutput';

export function getWritableOutput(
  project: Project,
  outputId: bigint,
): WritableOutput {
  const output = getOutput(project, outputId);
  switch (output.output.case) {
    case 'serialDmxOutput':
      return getDmxWritableOutput(project, outputId);
    default:
      throw Error(
        `Unknown output type in getWritableOutput! ${output.output.case}`,
      );
  }
}
