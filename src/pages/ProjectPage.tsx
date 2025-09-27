import { JSX, useContext } from 'react';

import { TextInput } from '../components/Input';
import { ProjectContext } from '../contexts/ProjectContext';
import { escapeForFilesystem } from '../util/fileUtils';

import styles from './ProjectPage.module.scss';

export default function ProjectPage(): JSX.Element {
  const { project, save } = useContext(ProjectContext);

  return (
    <div className={styles.browser}>
      <TextInput
        value={project.name}
        onChange={(value) => {
          project.name = value;
          save(`Set project name to "${value}".`);
        }}
      />
      <div>{escapeForFilesystem(project.name)}</div>
    </div>
  );
}
