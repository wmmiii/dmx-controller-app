import { Project } from "@dmx-controller/proto/project_pb";

// Good resolution, nice divisors (2, 3, 4, 5, 6, 12 etc.)
export const SEQUENCE_BEAT_RESOLUTION = 36000;

export function deleteSequence(universeSequenceId: number, project: Project): void {
  // Remove from scenes
  for (const scene of project.scenes) {
    scene.components = scene.components.filter(c => c.universeSequenceId !== universeSequenceId);
  }

  // Retire fixtureSequences number
  delete project.fixtureSequences[universeSequenceId];
}
