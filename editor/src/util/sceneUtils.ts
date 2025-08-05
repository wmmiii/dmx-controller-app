import { Project } from '@dmx-controller/proto/project_pb';

export function getActiveScene(project: Project) {
  return project.scenes[project.activeScene.toString()];
}
