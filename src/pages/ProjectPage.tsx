import { JSX, useContext } from 'react';

import { create } from '@bufbuild/protobuf';
import {
  NumberInputMode,
  SettingsSchema,
} from '@dmx-controller/proto/settings_pb';
import { Button } from '../components/Button';
import { TextInput, ToggleInput } from '../components/Input';
import { ProjectContext } from '../contexts/ProjectContext';
import { escapeForFilesystem } from '../util/fileUtils';
import styles from './ProjectPage.module.css';

export default function ProjectPage(): JSX.Element {
  const { project, save } = useContext(ProjectContext);

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
          <th>Number input mode</th>
          <td>
            <select
              value={
                project.settings?.numberInputMode ?? NumberInputMode.NORMALIZED
              }
              onChange={(e) => {
                let settings = project.settings;
                if (settings == null) {
                  settings = project.settings = create(SettingsSchema, {});
                }
                const mode = parseInt(e.target.value) as NumberInputMode;
                settings.numberInputMode = mode;
                const labels: Record<NumberInputMode, string> = {
                  [NumberInputMode.NORMALIZED]: '0–1',
                  [NumberInputMode.DMX]: '0–255',
                  [NumberInputMode.PERCENTAGE]: 'percentage',
                };
                save(`Set number input mode to ${labels[mode]}.`);
              }}
            >
              <option value={NumberInputMode.NORMALIZED}>
                0 – 1 (normalized)
              </option>
              <option value={NumberInputMode.DMX}>0 – 255 (DMX)</option>
              <option value={NumberInputMode.PERCENTAGE}>
                0 – 100 (percentage)
              </option>
            </select>
          </td>
        </tr>
        <tr>
          <th>Reset dialogs</th>
          <td>
            <Button
              onClick={() => {
                if (project.settings) {
                  project.settings.dismissedDialogs = [];
                  save('Reset dismissed dialogs.');
                }
              }}
              disabled={!Boolean(project.settings?.dismissedDialogs.length)}
            >
              Reset dismissed dialogs
            </Button>
          </td>
        </tr>
      </tbody>
    </table>
  );
}
