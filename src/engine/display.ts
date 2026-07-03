import { DdpOutput } from '@dmx-controller/proto/ddp_pb';
import { Project } from '@dmx-controller/proto/project_pb';

import { getActivePatch } from '../util/projectUtils';

/**
 * Deletes a DDP segment and cleans up any display mappings that reference it.
 * Also adjusts segment indices for mappings pointing to later segments.
 */
export function deleteDdpSegment(
  project: Project,
  outputId: bigint,
  segmentIndex: number,
) {
  const patchId = project.activePatch;
  const output = getActivePatch(project).outputs[outputId.toString()];
  const ddpOutput = output.output.value as DdpOutput;

  // Remove the segment from the DDP output
  ddpOutput.segments.splice(segmentIndex, 1);

  // Remove display mappings that reference this segment
  for (const display of Object.values(project.displays)) {
    display.mappings = display.mappings.filter(
      (m) =>
        !(
          m.patch === patchId &&
          m.output === outputId &&
          m.segment === BigInt(segmentIndex)
        ),
    );

    // Adjust indices for mappings pointing to later segments
    for (const mapping of display.mappings) {
      if (
        mapping.patch === patchId &&
        mapping.output === outputId &&
        mapping.segment > BigInt(segmentIndex)
      ) {
        mapping.segment = mapping.segment - 1n;
      }
    }
  }
}

/**
 * Deletes a DDP output (device) and cleans up any display mappings that reference it.
 */
export function deleteDdpOutput(project: Project, outputId: bigint) {
  const patchId = project.activePatch;

  // Remove all display mappings that reference this output
  for (const display of Object.values(project.displays)) {
    display.mappings = display.mappings.filter(
      (m) => !(m.patch === patchId && m.output === outputId),
    );
  }
}
