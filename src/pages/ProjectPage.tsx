import { JSX, useContext } from 'react';

import { create } from '@bufbuild/protobuf';
import {
  NumberInputMode,
  SettingsSchema,
} from '@dmx-controller/proto/settings_pb';
import { Button } from '../components/Button';
import { TextInput } from '../components/Input';
import { Select } from '../components/Select';
import { Toggle } from '../components/Toggle';
import { ProjectContext } from '../contexts/ProjectContext';
import { escapeForFilesystem } from '../util/fileUtils';
import styles from './ProjectPage.module.css';

const NUMBER_INPUT_OPTIONS = [
  {
    value: NumberInputMode.NORMALIZED,
    name: 'normalized',
    label: '0 to 1 (half is 0.5)',
  },
  { value: NumberInputMode.DMX, name: 'dmx', label: 'dmx value (half is 128)' },
  {
    value: NumberInputMode.PERCENT,
    name: 'percent',
    label: 'percent (half is 50%)',
  },
];

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
            <Toggle
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
            <Select
              value={
                project.settings?.numberInputMode ?? NumberInputMode.PERCENT
              }
              options={NUMBER_INPUT_OPTIONS}
              onChange={(mode) => {
                let settings = project.settings;
                if (settings == null) {
                  settings = project.settings = create(SettingsSchema, {});
                }

                const option = NUMBER_INPUT_OPTIONS.find(
                  (o) => o.value === mode,
                );
                settings.numberInputMode = mode;
                save(`Set number input mode to ${option?.name ?? mode}.`);
              }}
            />
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
