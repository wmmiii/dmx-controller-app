import React, { PropsWithChildren, createContext, useCallback, useEffect, useState } from 'react';
import { FixtureDefinition, PhysicalFixture } from '@dmx-controller/proto/fixture_pb';
import { Project } from '@dmx-controller/proto/project_pb';
import ldb from '@dmx-controller/third_party/DVLP/local_storage_db/localdata.min.js';

const PROJECT_KEY = "tmp-project";

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
  saveProject: (_project: Project) => { },
});

export function ProjectProvider({ children }: PropsWithChildren): JSX.Element {
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    ldb.get(PROJECT_KEY, (str: string) => {
      if (str) {
        setProject(Project.fromJsonString(str));
      } else {
        setProject(DEFAULT_PROJECT);
      }
    });
  }, [])

  const saveProject = useCallback((project: Project) => {
    ldb.set(PROJECT_KEY, project.toJsonString(), () => {
      setProject(new Project(project));
    });
  }, [setProject]);

  return (
    <ProjectContext.Provider value={{
      project: project,
      saveProject: saveProject,
    }}>
      {children}
    </ProjectContext.Provider>
  );
}
