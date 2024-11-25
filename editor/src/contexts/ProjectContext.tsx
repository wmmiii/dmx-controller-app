import React, { PropsWithChildren, createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { FixtureDefinition, PhysicalFixture } from '@dmx-controller/proto/fixture_pb';
import { Project, Project_Assets } from '@dmx-controller/proto/project_pb';
import { getBlob, storeBlob } from '../util/storageUtil';
import upgradeProject from '../util/projectUpgrader';
import { ShortcutContext } from './ShortcutContext';
import { escapeForFilesystem } from '../util/fileUtils';

const PROJECT_KEY = "tmp-project-1";
const ASSETS_KEY = "tmp-assets-1";
const MAX_UNDO = 100;

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
  fixtureDefinitionId: 1,
  channelOffset: 0,
});

const DEFAULT_PROJECT = new Project({
  name: "Untitled Project",
  updateFrequencyMs: 15,
  timingOffsetMs: 0,
  fixtureDefinitions: {
    0: miniLedMovingHead,
  },
  physicalFixtures: {
    0: fixture,
  },
});

interface Operation {
  projectState: Uint8Array;
  description: string;
}

export const ProjectContext = createContext({
  project: null as (Project | null),
  save: (_changeDescription: string, _undoable?: boolean) => { },
  update: () => { },
  saveAssets: () => { },
  downloadProject: () => { },
  openProject: (_project: Uint8Array) => { },
  lastOperation: '',
});

export function ProjectProvider({ children }: PropsWithChildren): JSX.Element {
  const { setShortcuts } = useContext(ShortcutContext);
  const [project, setProject] = useState<Project | null>(null);
  const [lastOperation, setLastOperation] = useState('');
  const operationStack = useRef<Operation[]>([]);
  const [operationIndex, setOperationIndex] = useState<number>(-1);

  // Expose project globally for debugging purposes.
  useEffect(() => {
    const global = (window || globalThis) as any;
    global['project'] = project;
  }, [project]);

  useEffect(() => {
    (async () => {
      try {
        const projectBlob = await getBlob(PROJECT_KEY);
        const assetsBlob = await getBlob(ASSETS_KEY);
        if (projectBlob == null) {
          setProject(DEFAULT_PROJECT);
          return;
        } else {
          const p = Project.fromBinary(projectBlob);
          if (assetsBlob != null) {
            p.assets = Project_Assets.fromBinary(assetsBlob);
          }
          upgradeProject(p);
          setProject(p);
          setLastOperation('Open project.');
          operationStack.current = [{
            projectState: projectBlob,
            description: 'Open project.',
          }];
          setOperationIndex(0);
        }
      } catch (ex) {
        console.error('Could not open project!', ex);
        setProject(DEFAULT_PROJECT);
      }
    })();
  }, []);

  const saveImpl = useCallback(async (project: Project, changeDescription: string) => {
    console.time(changeDescription);
    try {
      const minProject = new Project(project);
      minProject.assets = undefined;
      await storeBlob(PROJECT_KEY, minProject.toBinary());
    } catch (t) {
      throw t;
    } finally {
      console.timeEnd(changeDescription);
    }
  }, []);

  const update = useCallback(
    () => setProject(new Project(project)),
    [project, setProject]);

  const save = useCallback(async (changeDescription: string, undoable?: boolean) => {
    await saveImpl(project, changeDescription);
    const minProject = new Project(project);
    minProject.assets = undefined;

    if (undoable !== false) {
      // Remove all redo future operations & push current operation.
      operationStack.current.splice(operationIndex + 1, operationStack.current.length - operationIndex - 1);

      operationStack.current.push({
        projectState: minProject.toBinary(),
        description: changeDescription,
      });
      // Truncate operation stack to MAX_UNDO length.
      if (operationStack.current.length > MAX_UNDO) {
        operationStack.current.splice(0, operationStack.current.length - MAX_UNDO);
      }
      setOperationIndex(operationStack.current.length - 1);
    }

    setProject(new Project(project));
    setLastOperation(changeDescription);
  }, [project, operationStack, operationIndex, setProject, setOperationIndex]);

  const saveAssetsImpl = useCallback(async (project: Project) => {
    console.time('save assets');
    const assets = new Project_Assets(project.assets);
    await storeBlob(ASSETS_KEY, assets.toBinary());
    console.timeEnd('save assets');
  }, []);

  const saveAssets = useCallback(async () => {
    saveAssetsImpl(project);
    await saveImpl(project, 'Updating assets.');
  }, [project, save]);

  const undo = useCallback(async () => {
    if (operationIndex > 0) {
      const state = operationStack.current[operationIndex - 1].projectState;
      const description = operationStack.current[operationIndex].description;
      const p = Project.fromBinary(state);
      await saveImpl(p, `Undo: ${description}`);
      setOperationIndex(operationIndex - 1);
      setProject(p);
      setLastOperation(`Undo: ${description}`);
    }
  }, [operationIndex, operationStack, setOperationIndex, setProject, saveImpl]);

  const redo = useCallback(async () => {
    if (operationIndex < operationStack.current.length - 1) {
      const state = operationStack.current[operationIndex + 1].projectState;
      const description = operationStack.current[operationIndex + 1].description;
      const p = Project.fromBinary(state);
      await saveImpl(p, `Redo: ${description}`);
      setOperationIndex(operationIndex + 1);
      setProject(p);
      setLastOperation(`Redo: ${description}`);
    }
  }, [operationIndex, operationStack, setOperationIndex, setProject, saveImpl]);

  const downloadProject = useCallback(() => {
    const blob = new Blob([project.toBinary()], {
      type: 'application/protobuf',
    });

    let url = '';
    try {
      url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = escapeForFilesystem(project.name) + '.dmxapp';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      URL.revokeObjectURL(url);
    }
  }, [project]);

  const openProject = useCallback(async (projectBlob: Uint8Array) => {
    const p = Project.fromBinary(projectBlob);
    upgradeProject(p);
    await saveAssetsImpl(p);
    await saveImpl(p, 'Open project.');
    setProject(p);
    setOperationIndex(0);
    operationStack.current = [{
      projectState: projectBlob,
      description: 'Open project.',
    }];
    setLastOperation('Open project.');
  }, [saveAssetsImpl, saveImpl, setProject, setOperationIndex, operationStack, setLastOperation]);

  useEffect(() => {
    const shortcuts: Parameters<typeof setShortcuts>[0] = [];
    if (operationIndex > 0) {
      shortcuts.push({
        shortcut: { key: 'KeyZ', modifiers: ['ctrl'] },
        action: () => undo(),
        description: `Undo ${operationStack.current[operationIndex].description}`,
      });
    }
    if (operationIndex < operationStack.current.length - 1) {
      shortcuts.push({
        shortcut: { key: 'KeyZ', modifiers: ['ctrl', 'shift'] },
        action: () => redo(),
        description: `Redo ${operationStack.current[operationIndex + 1].description}`,
      });
    }
    return setShortcuts(shortcuts)
  }, [operationStack, operationIndex, redo, undo]);

  return (
    <ProjectContext.Provider value={{
      project: project,
      save: save,
      update: update,
      saveAssets: saveAssets,
      downloadProject: downloadProject,
      openProject: openProject,
      lastOperation: lastOperation,
    }}>
      {children}
    </ProjectContext.Provider>
  );
}
