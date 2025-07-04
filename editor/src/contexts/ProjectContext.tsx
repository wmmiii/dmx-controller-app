import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import { type ColorPalette } from '@dmx-controller/proto/color_pb';
import {
  ProjectSchema,
  Project_Assets,
  Project_AssetsSchema,
  type Project,
} from '@dmx-controller/proto/project_pb';
import {
  UniverseSchema,
  type Universe,
} from '@dmx-controller/proto/universe_pb';
import {
  JSX,
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import { DEFAULT_COLOR_PALETTE } from '../engine/universe';
import { downloadBlob, escapeForFilesystem } from '../util/fileUtils';
import { randomUint64 } from '../util/numberUtils';
import upgradeProject from '../util/projectUpgrader';
import { getBlob, storeBlob } from '../util/storageUtil';

import { ShortcutContext } from './ShortcutContext';

const PROJECT_KEY = 'tmp-project-1';
const ASSETS_KEY = 'tmp-assets-1';
const MAX_UNDO = 100;

let globalOpened = false;

const DEFAULT_UNIVERSE_MAP: { [id: string]: Universe } = {};
const DEFAULT_UNIVERSE_ID = randomUint64();
DEFAULT_UNIVERSE_MAP[DEFAULT_UNIVERSE_ID.toString()] = create(UniverseSchema, {
  name: 'Default Universe',
  fixtures: {},
}) as Universe;

const DEFAULT_COLOR_PALETTES: { [id: string]: ColorPalette } = {};
const DEFAULT_COLOR_PALETTE_ID = crypto.randomUUID();
DEFAULT_COLOR_PALETTES[DEFAULT_COLOR_PALETTE_ID] = DEFAULT_COLOR_PALETTE;

const DEFAULT_PROJECT = create(ProjectSchema, {
  name: 'Untitled Project',
  updateFrequencyMs: 15,
  timingOffsetMs: 0,
  fixtureDefinitions: {},
  physicalFixtures: {},
  scenes: [
    {
      name: 'Default scene',
      tileMap: [],
      colorPalettes: DEFAULT_COLOR_PALETTES,
      activeColorPalette: DEFAULT_COLOR_PALETTE_ID,
      lastActiveColorPalette: DEFAULT_COLOR_PALETTE_ID,
    },
  ],
  liveBeat: {
    lengthMs: Math.floor(60_000 / 120),
    offsetMs: 0n,
  },
  activeUniverse: DEFAULT_UNIVERSE_ID,
  universes: DEFAULT_UNIVERSE_MAP,
}) as Project;

interface Operation {
  projectState: Uint8Array;
  description: string;
}

export const ProjectContext = createContext({
  project: create(ProjectSchema, {}) as Project,
  lastLoad: new Date(),
  save: (_changeDescription: string, _undoable?: boolean) => {},
  update: () => {},
  saveAssets: () => {},
  downloadProject: () => {},
  openProject: (_project: Uint8Array) => {},
  lastOperation: '',
});

export function ProjectProvider({ children }: PropsWithChildren): JSX.Element {
  const { setShortcuts } = useContext(ShortcutContext);
  const [project, setProject] = useState<Project | null>(null);
  const projectRef = useRef(project);
  useEffect(() => {
    projectRef.current = project;
  }, [project]);
  const [lastLoad, setLastLoad] = useState(new Date());
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
      if (globalOpened) {
        return;
      }
      globalOpened = true;
      try {
        const projectBlob = await getBlob(PROJECT_KEY);
        const assetsBlob = await getBlob(ASSETS_KEY);
        if (projectBlob == null) {
          setProject(DEFAULT_PROJECT);
          return;
        } else {
          const p = fromBinary(ProjectSchema, projectBlob) as Project;
          if (assetsBlob != null) {
            p.assets = fromBinary(
              Project_AssetsSchema,
              assetsBlob,
            ) as Project_Assets;
          }
          upgradeProject(p);
          setProject(p);
          setLastOperation('Open project.');
          operationStack.current = [
            {
              projectState: projectBlob,
              description: 'Open project.',
            },
          ];
          setOperationIndex(0);
        }
      } catch (ex) {
        console.error('Could not open project!', ex);
        setProject(DEFAULT_PROJECT);
      }
    })();
  }, []);

  const saveImpl = useCallback(
    async (project: Project, changeDescription: string) => {
      console.time(changeDescription);
      try {
        const minProject = create(ProjectSchema, project) as Project;
        minProject.assets = undefined;
        await storeBlob(
          PROJECT_KEY,
          toBinary(ProjectSchema, minProject, { writeUnknownFields: false }),
        );
      } catch (t) {
        throw t;
      } finally {
        console.timeEnd(changeDescription);
      }
    },
    [],
  );

  const update = useCallback(() => {
    if (projectRef.current == null) {
      throw new Error('Tried to update without project loaded!');
    }
    setProject(create(ProjectSchema, projectRef.current) as Project);
  }, [projectRef, setProject]);

  const save = useCallback(
    async (changeDescription: string, undoable?: boolean) => {
      if (projectRef.current == null) {
        throw new Error('Tried to save without project loaded!');
      }
      await saveImpl(projectRef.current, changeDescription);
      const minProject = create(ProjectSchema, projectRef.current) as Project;
      minProject.assets = undefined;

      if (undoable !== false) {
        // Remove all redo future operations & push current operation.
        operationStack.current.splice(
          operationIndex + 1,
          operationStack.current.length - operationIndex - 1,
        );

        operationStack.current.push({
          projectState: toBinary(ProjectSchema, minProject, {
            writeUnknownFields: false,
          }),
          description: changeDescription,
        });
        // Truncate operation stack to MAX_UNDO length.
        if (operationStack.current.length > MAX_UNDO) {
          operationStack.current.splice(
            0,
            operationStack.current.length - MAX_UNDO,
          );
        }
        setOperationIndex(operationStack.current.length - 1);
      }

      setProject(create(ProjectSchema, projectRef.current) as Project);
      setLastOperation(changeDescription);
    },
    [projectRef, operationStack, operationIndex, setProject, setOperationIndex],
  );

  const saveAssetsImpl = useCallback(async (project: Project) => {
    console.time('save assets');
    const assets = create(Project_AssetsSchema, project.assets);
    await storeBlob(
      ASSETS_KEY,
      toBinary(Project_AssetsSchema, assets, { writeUnknownFields: false }),
    );
    console.timeEnd('save assets');
  }, []);

  const saveAssets = useCallback(async () => {
    if (project == null) {
      throw new Error('Tried to save assets without project loaded!');
    }
    await saveAssetsImpl(project);
    await saveImpl(project, 'Updating assets.');
  }, [project, save]);

  const undo = useCallback(async () => {
    if (project == null) {
      throw new Error('Tried to undo without project loaded!');
    }
    if (operationIndex > 0) {
      const state = operationStack.current[operationIndex - 1].projectState;
      const description = operationStack.current[operationIndex].description;
      const p = fromBinary(ProjectSchema, state) as Project;
      await saveImpl(p, `Undo: ${description}`);
      setOperationIndex(operationIndex - 1);
      setProject(
        create(ProjectSchema, { ...p, assets: project.assets }) as Project,
      );
      setLastOperation(`Undo: ${description}`);
    }
  }, [
    operationIndex,
    operationStack,
    project,
    setOperationIndex,
    setProject,
    saveImpl,
  ]);

  const redo = useCallback(async () => {
    if (project == null) {
      throw new Error('Tried to redo without project loaded!');
    }
    if (operationIndex < operationStack.current.length - 1) {
      const state = operationStack.current[operationIndex + 1].projectState;
      const description =
        operationStack.current[operationIndex + 1].description;
      const p = fromBinary(ProjectSchema, state) as Project;
      await saveImpl(p, `Redo: ${description}`);
      setOperationIndex(operationIndex + 1);
      setProject(
        create(ProjectSchema, { ...p, assets: project.assets }) as Project,
      );
      setLastOperation(`Redo: ${description}`);
    }
  }, [
    operationIndex,
    operationStack,
    project,
    setOperationIndex,
    setProject,
    saveImpl,
  ]);

  const downloadProject = useCallback(() => {
    if (project == null) {
      throw new Error('Tried to download without project loaded!');
    }
    const blob = new Blob([toBinary(ProjectSchema, project)], {
      type: 'application/protobuf',
    });

    downloadBlob(blob, escapeForFilesystem(project.name) + '.dmxapp');
  }, [project]);

  const openProject = useCallback(
    async (projectBlob: Uint8Array) => {
      const p = fromBinary(ProjectSchema, projectBlob) as Project;
      upgradeProject(p);
      await saveAssetsImpl(p);
      await saveImpl(p, 'Open project.');
      setProject(p);
      setLastLoad(new Date());
      setOperationIndex(0);
      operationStack.current = [
        {
          projectState: projectBlob,
          description: 'Open project.',
        },
      ];
      setLastOperation('Open project.');
    },
    [
      saveAssetsImpl,
      saveImpl,
      setProject,
      setOperationIndex,
      operationStack,
      setLastOperation,
    ],
  );

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
    return setShortcuts(shortcuts);
  }, [operationStack, operationIndex, redo, undo]);

  if (project == null) {
    return <>Loading...</>;
  }

  return (
    <ProjectContext.Provider
      value={{
        project: project,
        lastLoad: lastLoad,
        save: save,
        update: update,
        saveAssets: saveAssets,
        downloadProject: downloadProject,
        openProject: openProject,
        lastOperation: lastOperation,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}
