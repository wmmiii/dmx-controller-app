import { useContext } from 'react';
import styles from './ProjectPage.module.scss';
import { ProjectContext } from '../contexts/ProjectContext';
import { TextInput } from '../components/Input';
import { escapeForFilesystem } from '../util/fileUtils';

export default function ProjectPage(): JSX.Element {
  const { project, save } = useContext(ProjectContext);

  if (!project) {
    return (
      <div>
        Loading...
      </div>
    );
  }

  return (
    <div className={styles.browser}>
      <TextInput
        value={project.name}
        onChange={(value) => {
          project.name = value;
          save(`Set project name to "${value}".`);
        }} />
      <div>
        {escapeForFilesystem(project.name)}
      </div>
    </div>
  );
}
