import { Project } from "@dmx-controller/proto/project_pb";

export function getActiveUniverse(project: Project) {
  return project?.universes[project.activeUniverse.toString()];
}