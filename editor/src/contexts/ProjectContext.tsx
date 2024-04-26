import React, { PropsWithChildren, createContext, useCallback, useEffect, useRef, useState } from 'react';
import { FixtureDefinition, PhysicalFixture } from '@dmx-controller/proto/fixture_pb';
import { Project, Project_Assets } from '@dmx-controller/proto/project_pb';
import { getBlob, storeBlob } from '../util/storageUtil';

const PROJECT_KEY = "tmp-project-1";
const ASSETS_KEY = "tmp-assets-1";

const miniLedMovingHead = new FixtureDefinition({
  name: 'Mini LED Moving Head',
  manufacturer: 'Wash',
  channels: {
    1: { type: 'pan', minDegrees: -180, maxDegrees: 360 },
    2: { type: 'pan-fine', minDegrees: -180, maxDegrees: 360 },
    3: { type: 'tilt', minDegrees: -90, maxDegrees: 90 },
    4: { type: 'tilt-fine', minDegrees: -90, maxDegrees: 90 },
    7: { type: 'red' },
    8: { type: 'green' },
    9: { type: 'blue' },
    10: { type: 'white' }
  }
});

const fixture = new PhysicalFixture({
  name: 'Moving Head 1',
  fixtureDefinitionId: 0,
  channelOffset: 0,
});

const DEFAULT_PROJECT = new Project({
  name: "Untitled Project",
  updateFrequencyMs: 15,
  updateOffsetMs: 50,
  fixtureDefinitions: {
    0: miniLedMovingHead,
  },
  physicalFixtures: {
    0: fixture,
  },
});

export const ProjectContext = createContext({
  project: null as (Project | null),
  save: () => { },
  saveAssets: () => { },
  downloadProject: () => { },
  openProject: (_project: Uint8Array) => { },
});

export function ProjectProvider({ children }: PropsWithChildren): JSX.Element {
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const projectBlob = await getBlob(PROJECT_KEY);
        const assetsBlob = await getBlob(ASSETS_KEY);
        if (projectBlob == null || assetsBlob == null) {
          setProject(DEFAULT_PROJECT);
          return;
        } else {
          const p = Project.fromBinary(projectBlob);
          p.assets = Project_Assets.fromBinary(assetsBlob);
          setProject(p);
        }
      } catch (ex) {
        console.error(ex);
        setProject(DEFAULT_PROJECT);
      }
    })();
  }, []);

  const saveImpl = useCallback(async (project: Project) => {
    console.time('save');
    try {
      const minProject = new Project(project);
      minProject.assets = undefined;
      await storeBlob(PROJECT_KEY, minProject.toBinary());
    } catch (t) {
      console.log(project);
      throw t;
    } finally {
      console.timeEnd('save');
    }
  }, []);

  const save = useCallback(async () => {
    saveImpl(project);
    setProject(new Project(project));
  }, [project, setProject]);

  const saveAssetsImpl = useCallback(async (project: Project) => {
    console.time('save assets');
    const assets = new Project_Assets(project.assets);
    await storeBlob(ASSETS_KEY, assets.toBinary());
    console.timeEnd('save assets');
  }, []);

  const saveAssets = useCallback(async () => {
    saveAssetsImpl(project);
    await saveImpl(project);
  }, [project, save]);

  const downloadProject = useCallback(() => {
    const blob = new Blob([project.toBinary()], {
      type: 'application/protobuf',
    });

    let url = '';
    try {
      url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = project.name + '.proto';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      URL.revokeObjectURL(url);
    }
  }, [project]);

  const openProject = useCallback(async (projectBlob: Uint8Array) => {
    const p = Project.fromBinary(projectBlob);
    await saveAssetsImpl(p);
    await saveImpl(p);
    setProject(p);
  }, []);

  return (
    <ProjectContext.Provider value={{
      project: project,
      save: save,
      saveAssets: saveAssets,
      downloadProject: downloadProject,
      openProject: openProject,
    }}>
      {children}
    </ProjectContext.Provider>
  );
}
