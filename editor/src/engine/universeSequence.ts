import { Project } from "@dmx-controller/proto/project_pb";

export function deleteSequence(universeSequenceId: number, project: Project): void {
  // Remove from scenes
  for (const scene of project.scenes) {
    scene.components = scene.components.filter(c => c.universeSequenceId !== universeSequenceId);
  }

  // Retire fixtureSequences number
  delete project.universeSequences[universeSequenceId];
}
