import React, { useContext, useState } from 'react';
import { HorizontalSplitPane } from '../components/SplitPane';
import { Scene } from '@dmx-controller/proto/scene_pb';
import { ProjectContext } from '../contexts/ProjectContext';
import { Button } from '../components/Button';
import styles from "./LivePage.module.scss";

export function LivePage(): JSX.Element {
  return (
    <HorizontalSplitPane
      className={styles.wrapper}
      defaultAmount={0.2}
      left={<SceneList />}
      right={<ScenePane />} />
  );
}

function SceneList(): JSX.Element {
  const { project, save } = useContext(ProjectContext);

  if (!project) {
    return null;
  }

  return (
    <ul>
      {
        project.scenes.map((s: Scene) => (
          <li>
            {s.name}
          </li>
        ))
      }
      <li>
        <Button onClick={() => {
          project.scenes.push(new Scene({
            name: 'Untitled Scene',
            components: [],
          }));
          project.activeScene = project.scenes.length - 1;
          save();
        }}>
          + Create New Scene
        </Button>
      </li>
    </ul>
  );
}

function ScenePane(): JSX.Element {
  const { project, save } = useContext(ProjectContext);

  if (!project || !project.scenes[project.activeScene]) {
    return (
      <div className={styles.noSceneSelected}>
        Create a new scene to get started.
      </div>
    );
  }

  return (
    <div className={styles.scenePane}>
    </div>
  );
}
