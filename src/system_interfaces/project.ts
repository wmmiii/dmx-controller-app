import { clone, fromBinary, toBinary } from '@bufbuild/protobuf';
import { Project, ProjectSchema } from '@dmx-controller/proto/project_pb';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// Event payload types from Tauri backend
interface ProjectUpdatedEvent {
  project_binary: number[];
  description: string;
}

interface UndoStateChangedEvent {
  can_undo: boolean;
  can_redo: boolean;
  undo_description: string | null;
  redo_description: string | null;
}

// Subscriber types
type ProjectSubscriber = (project: Project, description: string) => void;
type UndoStateSubscriber = (state: UndoStateChangedEvent) => void;

// Subscriber lists
const projectSubscribers: ProjectSubscriber[] = [];
const undoStateSubscribers: UndoStateSubscriber[] = [];

/**
 * Subscribe to project updates from the backend.
 * Returns an unsubscribe function.
 */
export function subscribeToProjectUpdates(
  subscriber: ProjectSubscriber,
): () => void {
  projectSubscribers.push(subscriber);
  return () => {
    const index = projectSubscribers.indexOf(subscriber);
    if (index !== -1) {
      projectSubscribers.splice(index, 1);
    }
  };
}

/**
 * Subscribe to undo state changes from the backend.
 * Returns an unsubscribe function.
 */
export function subscribeToUndoState(
  subscriber: UndoStateSubscriber,
): () => void {
  undoStateSubscribers.push(subscriber);
  return () => {
    const index = undoStateSubscribers.indexOf(subscriber);
    if (index !== -1) {
      undoStateSubscribers.splice(index, 1);
    }
  };
}

/**
 * Saves project state to the backend with undo support and persistence.
 */
export async function saveProject(
  project: Project,
  description: string,
  undoable: boolean = true,
): Promise<void> {
  const minProject = clone(ProjectSchema, project);
  minProject.assets = undefined; // Assets stored separately
  const projectBinary = toBinary(ProjectSchema, minProject, {
    writeUnknownFields: false,
  });

  await invoke('save_project', {
    projectBinary: Array.from(projectBinary),
    description,
    undoable,
  });
}

/**
 * Updates project state without persistence or undo tracking.
 * Used for live updates during drag operations.
 */
export async function updateProject(project: Project): Promise<void> {
  const projectBinary = toBinary(ProjectSchema, project);
  await invoke('update_project', {
    projectBinary: Array.from(projectBinary),
  });
}

/**
 * Undoes the last operation.
 */
export async function undoProject(): Promise<void> {
  await invoke('undo_project');
}

/**
 * Redoes the previously undone operation.
 */
export async function redoProject(): Promise<void> {
  await invoke('redo_project');
}

/**
 * Loads a project, resetting the undo stack.
 */
export async function loadProject(projectBinary: Uint8Array): Promise<void> {
  await invoke('load_project', {
    projectBinary: Array.from(projectBinary),
  });
}

/**
 * Returns the current undo/redo availability state.
 */
export async function getUndoState(): Promise<UndoStateChangedEvent> {
  return invoke('get_undo_state');
}

// Initialize Tauri event listeners at module load
initProjectListeners();

/**
 * Initialize Tauri project event listeners.
 * Listeners exist for the lifetime of the application.
 */
async function initProjectListeners(): Promise<void> {
  // Listen for project-updated events from Tauri backend
  await listen<ProjectUpdatedEvent>('project-updated', (event) => {
    const payload = event.payload;
    const project = fromBinary(
      ProjectSchema,
      new Uint8Array(payload.project_binary),
    ) as Project;

    // Notify all subscribers
    for (const subscriber of projectSubscribers) {
      subscriber(project, payload.description);
    }
  });

  // Listen for undo-state-changed events from Tauri backend
  await listen<UndoStateChangedEvent>('undo-state-changed', (event) => {
    const payload = event.payload;

    // Notify all subscribers
    for (const subscriber of undoStateSubscribers) {
      subscriber(payload);
    }
  });
}
