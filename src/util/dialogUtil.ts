import { create } from '@bufbuild/protobuf';
import { type Project } from '@dmx-controller/proto/project_pb';
import { SettingsSchema } from '@dmx-controller/proto/settings_pb';

export function dismissDialog(project: Project, key: string): void {
  if (project.settings == null) {
    project.settings = create(SettingsSchema, {});
  }
  if (!project.settings.dismissedDialogs.includes(key)) {
    project.settings.dismissedDialogs.push(key);
  }
}

export function isDialogDismissed(project: Project, key: string): boolean {
  return project.settings?.dismissedDialogs.includes(key) ?? false;
}
