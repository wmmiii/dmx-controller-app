import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
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

import { invoke } from '@tauri-apps/api/core';
import upgradeProject from '../util/projectUpgrader';
import styles from './ProjectContext.module.css';

import {
  frontendReadyForUpdate,
  newProject as newProjectCommand,
  redoProject as redoProjectCommand,
  requestUpdate,
  saveAssets as saveAssetsCommand,
  saveProject as saveProjectCommand,
  subscribeToProjectUpdates,
  subscribeToUndoState,
  undoProject as undoProjectCommand,
  updateProject as updateProjectCommand,
} from '../system_interfaces/project';
import { ShortcutContext } from './ShortcutContext';

let globalOpened = false;

export const ProjectContext = createContext({
  project: create(ProjectSchema, {}) as Project,
  lastLoad: new Date(),
  save: (_changeDescription: string, _undoable?: boolean) => {},
  update: () => {},
  saveAssets: () => {},
  downloadProject: () => {},
  openProject: () => {},
  newProject: () => {},
  lastOperation: null as string | null,
});

export function ProjectProvider({ children }: PropsWithChildren): JSX.Element {
  const { setShortcuts } = useContext(ShortcutContext);
  const [project, setProject] = useState<Project | null>(null);
  const projectRef = useRef(project);
  const assetsRef = useRef<Project_Assets | undefined>(undefined);

  const [lastLoad] = useState(new Date());
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const global = (window || globalThis) as any;
    global['project'] = project;
  }, [project]);

  // Subscribe to backend project updates with flow control.
  // The backend only sends updates when we signal ready, preventing MIDI
  // sliders from overwhelming the UI. We use RAF to sync with the display.
  useEffect(() => {
    const unsubscribe = subscribeToProjectUpdates((newProject, description) => {
      // Use RAF to sync state update with display refresh
      requestAnimationFrame(() => {
        // Merge assets back (they're stored separately in frontend)
        newProject.assets = assetsRef.current;

        // Apply any project upgrades and set state
        upgradeProject(newProject);
        setProject(newProject);
        setLastOperation(description);

        // Signal backend we're ready for the next update
        frontendReadyForUpdate();
      });
    });

    return unsubscribe;
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

  // Request initial project from backend
  useEffect(() => {
    if (globalOpened) {
      return;
    }
    globalOpened = true;

    requestUpdate().catch((err) => {
      console.error('Failed to request project update:', err);
    });
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

  // Save assets via backend
  const saveAssetsImpl = useCallback(async (project: Project) => {
    console.time('save assets');
    const assets = create(Project_AssetsSchema, project.assets);
    assetsRef.current = project.assets;
    await saveAssetsCommand(
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

  // Reset to a new default project
  const newProject = useCallback(async () => {
    await newProjectCommand();
    assetsRef.current = undefined;
  }, []);

  // Open project via native file dialog
  const openProject = useCallback(async () => {
    const assetsBinary: number[] | null = await invoke('import_project');
    if (assetsBinary != null) {
      assetsRef.current = fromBinary(
        Project_AssetsSchema,
        new Uint8Array(assetsBinary),
      ) as Project_Assets;
    }
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
    return (
      <div className={styles.loading}>
        <img src="./icon.svg" />
        <h1>Loading...</h1>
      </div>
    );
  }

  return (
    <ProjectContext.Provider
      value={{
        project: project,
        lastLoad: lastLoad,
        save: save,
        update: update,
        saveAssets: saveAssets,
        downloadProject: async () => await invoke('export_project'),
        openProject: openProject,
        newProject: newProject,
        lastOperation: lastOperation,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}
