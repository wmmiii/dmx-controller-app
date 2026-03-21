import { clone, create, fromBinary, toBinary } from '@bufbuild/protobuf';
import {
  ProjectSchema,
  Project_Assets,
  Project_AssetsSchema,
  type Project,
} from '@dmx-controller/proto/project_pb';
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

import { getBlob, storeBlob } from '../system_interfaces/storage';
import { downloadBlob, escapeForFilesystem } from '../util/fileUtils';
import upgradeProject from '../util/projectUpgrader';

import {
  getUndoState,
  loadProject as loadProjectCommand,
  redoProject as redoProjectCommand,
  saveProject as saveProjectCommand,
  subscribeToProjectUpdates,
  subscribeToUndoState,
  undoProject as undoProjectCommand,
  updateProject as updateProjectCommand,
} from '../system_interfaces/project';
import { createNewProject } from '../util/projectUtils';
import { ShortcutContext } from './ShortcutContext';

const ASSETS_KEY = 'tmp-assets-1';

let globalOpened = false;

export const ProjectContext = createContext({
  project: create(ProjectSchema, {}) as Project,
  lastLoad: new Date(),
  save: (_changeDescription: string, _undoable?: boolean) => {},
  update: () => {},
  saveAssets: () => {},
  downloadProject: () => {},
  openProject: (_project: Uint8Array) => {},
  lastOperation: null as string | null,
});

export function ProjectProvider({ children }: PropsWithChildren): JSX.Element {
  const { setShortcuts } = useContext(ShortcutContext);
  const [project, setProject] = useState<Project | null>(null);
  const projectRef = useRef(project);
  const assetsRef = useRef<Project_Assets | undefined>(undefined);

  const [lastLoad, setLastLoad] = useState(new Date());
  const [lastOperation, setLastOperation] = useState<string | null>(null);

  // Update coalescing: drop intermediate updates when updates are queued rapidly
  const updateInFlightRef = useRef(false);
  const updatePendingRef = useRef(false);

  // Undo state from backend
  const [undoState, setUndoState] = useState({
    canUndo: false,
    canRedo: false,
    undoDescription: null as string | null,
    redoDescription: null as string | null,
  });

  // Keep projectRef in sync with state
  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  // Expose project globally for debugging purposes.
  useEffect(() => {
    const global = (window || globalThis) as any;
    global['project'] = project;
  }, [project]);

  // Subscribe to backend project updates
  useEffect(() => {
    return subscribeToProjectUpdates((newProject, description) => {
      // Merge assets back (they're stored separately in frontend)
      newProject.assets = assetsRef.current;
      setProject(clone(ProjectSchema, newProject));
      setLastOperation(description);
    });
  }, []);

  // Subscribe to undo state changes from backend
  useEffect(() => {
    return subscribeToUndoState((state) => {
      setUndoState({
        canUndo: state.can_undo,
        canRedo: state.can_redo,
        undoDescription: state.undo_description,
        redoDescription: state.redo_description,
      });
    });
  }, []);

  // Initial load - load project from storage and send to backend
  useEffect(() => {
    (async () => {
      if (globalOpened) {
        return;
      }
      globalOpened = true;
      try {
        const projectBlob = await getBlob('tmp-project-1');
        const assetsBlob = await getBlob(ASSETS_KEY);

        // Load assets into ref
        if (assetsBlob != null) {
          assetsRef.current = fromBinary(
            Project_AssetsSchema,
            assetsBlob,
          ) as Project_Assets;
        }

        if (projectBlob == null) {
          // Create new project
          const newProject = createNewProject();
          newProject.assets = assetsRef.current;
          setProject(newProject);

          // Send to backend (this will also persist)
          const minProject = clone(ProjectSchema, newProject);
          minProject.assets = undefined;
          await loadProjectCommand(
            toBinary(ProjectSchema, minProject, { writeUnknownFields: false }),
          );
        } else {
          // Load existing project
          const p = fromBinary(ProjectSchema, projectBlob) as Project;
          p.assets = assetsRef.current;
          upgradeProject(p);
          setProject(p);
          setLastOperation('Open project.');

          // Send to backend to initialize state
          await loadProjectCommand(projectBlob);
        }

        // Get initial undo state
        const initialUndoState = await getUndoState();
        setUndoState({
          canUndo: initialUndoState.can_undo,
          canRedo: initialUndoState.can_redo,
          undoDescription: initialUndoState.undo_description,
          redoDescription: initialUndoState.redo_description,
        });
      } catch (ex) {
        console.error('Could not open project!', ex);
        const newProject = createNewProject();
        setProject(newProject);
      }
    })();
  }, []);

  // Update - sends to backend for rendering, no persistence
  // Uses coalescing: if updates come in while one is in flight,
  // only the latest update executes when the current one completes.
  const update = useCallback(() => {
    if (projectRef.current == null) {
      throw new Error('Tried to update without project loaded!');
    }

    // If an update is already in flight, mark that we have a pending update
    // (the latest state is always in projectRef.current)
    if (updateInFlightRef.current) {
      updatePendingRef.current = true;
      return;
    }

    // Send update to backend
    const sendUpdate = () => {
      updateInFlightRef.current = true;
      updateProjectCommand(projectRef.current!).then(() => {
        updateInFlightRef.current = false;

        // If another update came in while we were processing, send it now
        if (updatePendingRef.current) {
          updatePendingRef.current = false;
          sendUpdate();
        }
      });
    };

    sendUpdate();
  }, []);

  // Save - sends to backend with undo support and persistence
  const save = useCallback(
    async (changeDescription: string, undoable?: boolean) => {
      if (projectRef.current == null) {
        throw new Error('Tried to save without project loaded!');
      }
      // Send to backend
      await saveProjectCommand(
        projectRef.current,
        changeDescription,
        undoable !== false,
      );
    },
    [],
  );

  // Save assets (still frontend-managed)
  const saveAssetsImpl = useCallback(async (project: Project) => {
    console.time('save assets');
    const assets = create(Project_AssetsSchema, project.assets);
    assetsRef.current = project.assets;
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
    // Trigger a save to ensure project is persisted
    await save('Updating assets.');
  }, [project, save, saveAssetsImpl]);

  // Download project
  const downloadProject = useCallback(() => {
    if (project == null) {
      throw new Error('Tried to download without project loaded!');
    }
    const blob = new Blob([toBinary(ProjectSchema, project)], {
      type: 'application/protobuf',
    });
    downloadBlob(blob, escapeForFilesystem(project.name) + '.dmxapp');
  }, [project]);

  // Open project - load from file and send to backend
  const openProject = useCallback(async (projectBlob: Uint8Array) => {
    const p = fromBinary(ProjectSchema, projectBlob) as Project;
    upgradeProject(p);

    // Save assets separately
    if (p.assets) {
      assetsRef.current = p.assets;
      await storeBlob(
        ASSETS_KEY,
        toBinary(Project_AssetsSchema, p.assets, {
          writeUnknownFields: false,
        }),
      );
    }

    // Update local state
    setProject(p);
    setLastLoad(new Date());
    setLastOperation('Open project.');

    // Send to backend (will persist and reset undo stack)
    const minProject = clone(ProjectSchema, p);
    minProject.assets = undefined;
    await loadProjectCommand(
      toBinary(ProjectSchema, minProject, { writeUnknownFields: false }),
    );
  }, []);

  // Keyboard shortcuts for undo/redo based on backend state
  useEffect(() => {
    const shortcuts: Parameters<typeof setShortcuts>[0] = [];

    if (undoState.canUndo) {
      shortcuts.push({
        shortcut: { key: 'KeyZ', modifiers: ['ctrl'] },
        action: () => undoProjectCommand(),
        description: `Undo ${undoState.undoDescription ?? ''}`,
      });
    }

    if (undoState.canRedo) {
      shortcuts.push({
        shortcut: { key: 'KeyZ', modifiers: ['ctrl', 'shift'] },
        action: () => redoProjectCommand(),
        description: `Redo ${undoState.redoDescription ?? ''}`,
      });
    }

    return setShortcuts(shortcuts);
  }, [undoState, undoProjectCommand, redoProjectCommand, setShortcuts]);

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
