import React, { PropsWithChildren, createContext, useCallback, useEffect, useRef, useState } from 'react';
import { FixtureDefinition, PhysicalFixture } from '@dmx-controller/proto/fixture_pb';
import { Project, Project_Assets } from '@dmx-controller/proto/project_pb';
import ldb from '@dmx-controller/third_party/DVLP/local_storage_db/localdata.min.js';

const PROJECT_KEY = "tmp-project";
const ASSETS_KEY = "tmp-assets";

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
});

export function ProjectProvider({ children }: PropsWithChildren): JSX.Element {
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    ldb.get(PROJECT_KEY, (str: string) => {
      if (str) {
        ldb.get(ASSETS_KEY, (assetStr: string) => {
          const p = Project.fromJsonString(str);
          p.assets = Project_Assets.fromJsonString(assetStr);
          setProject(p);
        });
      } else {
        setProject(DEFAULT_PROJECT);
      }
    });
  }, []);

  const save = useCallback(() => {
    console.time('save');
    const minProject = new Project(project);
    minProject.assets = undefined;
    ldb.set(PROJECT_KEY, minProject.toJsonString(), () => {
      console.timeEnd('save');
      setProject(new Project(project));
    });
  }, [project, setProject]);

  const saveAssets = useCallback(() => {
    console.time('save assets');
    const assets = new Project_Assets(project.assets);
    ldb.set(ASSETS_KEY, assets.toJsonString(), () => {
      console.timeEnd('save assets');
      save();
    });
  }, [project, save]);

  return (
    <ProjectContext.Provider value={{
      project: project,
      save: save,
      saveAssets: saveAssets,
    }}>
      {children}
    </ProjectContext.Provider>
  );
}
