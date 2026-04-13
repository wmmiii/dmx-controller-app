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
                project.settings?.numberInputMode ?? NumberInputMode.PERCENT
              }
              onChange={(e) => {
                let settings = project.settings;
                if (settings == null) {
                  settings = project.settings = create(SettingsSchema, {});
                }
                const mode = parseInt(e.target.value) as NumberInputMode;

                let label;
                switch (mode) {
                  case NumberInputMode.NORMALIZED:
                    label = '[0, 1]';
                    break;
                  case NumberInputMode.DMX:
                    label = '0 to 255';
                    break;
                  case NumberInputMode.PERCENT:
                    label = 'percent';
                    break;
                  default:
                    throw Error(`Unrecognized input mode: ${mode}`);
                }

                settings.numberInputMode = mode;
                save(`Set number input mode to ${label}.`);
              }}
            >
              <option value={NumberInputMode.NORMALIZED}>
                0 to 1 (half is 0.5)
              </option>
              <option value={NumberInputMode.DMX}>
                dmx value (half is 128)
              </option>
              <option value={NumberInputMode.PERCENT}>
                percent (half is 50%)
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
