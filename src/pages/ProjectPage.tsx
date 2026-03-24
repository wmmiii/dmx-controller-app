import { JSX, useContext } from 'react';

import { create } from '@bufbuild/protobuf';
import { SettingsSchema } from '@dmx-controller/proto/settings_pb';
import { Button } from '../components/Button';
import { TextInput, ToggleInput } from '../components/Input';
import { DialogContext } from '../contexts/DialogContext';
import { ProjectContext } from '../contexts/ProjectContext';
import { escapeForFilesystem } from '../util/fileUtils';
import styles from './ProjectPage.module.css';

export default function ProjectPage(): JSX.Element {
  const { project, save } = useContext(ProjectContext);
  const { resetDismissed, dismissedReset } = useContext(DialogContext);

  return (
    <table className={styles.table}>
      <tbody>
        <tr>
          <th>Project name</th>
          <td>
            <TextInput
              value={project.name}
              onChange={(value) => {
                project.name = value;
                save(`Set project name to "${value}".`);
              }}
            />
          </td>
        </tr>
        <tr>
          <th>File name</th>
          <td>{escapeForFilesystem(project.name)}.dmxapp</td>
        </tr>
        <tr>
          <th>Interface style</th>
          <td>
            <ToggleInput
              labels={{ left: 'Mouse', right: 'Touch' }}
              value={project.settings?.touchInterface ?? false}
              onChange={(value) => {
                let settings = project.settings;
                if (settings == null) {
                  settings = project.settings = create(SettingsSchema, {});
                }
                settings.touchInterface = value;
                save(
                  `Set project interface type to ${value ? 'touch' : 'mouse'}`,
                );
              }}
            />
          </td>
        </tr>
        <tr>
          <th>Reset dialogs</th>
          <td>
            <Button onClick={resetDismissed} disabled={dismissedReset}>
              Reset dismissed dialogs
            </Button>
          </td>
        </tr>
      </tbody>
    </table>
  );
}
