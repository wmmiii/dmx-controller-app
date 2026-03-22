import { clone, create, equals } from '@bufbuild/protobuf';
import {
  ControllerBindingsMap,
  ControllerBindingsMapSchema,
  ControllerBindingsMap_ControllerBindingsSchema,
  InputBindingSchema,
  InputType,
  TileStrengthAction,
  type InputBinding,
} from '@dmx-controller/proto/controller_pb';
import { type Project } from '@dmx-controller/proto/project_pb';

import {
  ControlCommandType,
  ControllerChannel,
} from '../contexts/ControllerContext';

import { getActiveScene } from '../util/sceneUtils';
import { performTileStrength } from './tileStrength';

/**
 * Represents a location in the binding hierarchy.
 */
export type BindingContext =
  | { type: 'live_page' }
  | { type: 'scene'; sceneId: bigint };

export function contextName(project: Project, context: BindingContext) {
  switch (context.type) {
    case 'live_page':
      return 'Live page';
    case 'scene':
      return `Scene "${project.scenes[context.sceneId.toString()].name}"`;
    default:
      throw Error('Unknown context type: ' + (context as any).type);
  }
}

/**
 * Gets or creates the ControllerBindingsMap for a given context.
 */
function getOrCreateBindingsMap(
  project: Project,
  context: BindingContext,
): ControllerBindingsMap {
  switch (context.type) {
    case 'live_page':
      if (!project.livePageControllerBindings) {
        project.livePageControllerBindings = create(
          ControllerBindingsMapSchema,
          {
            bindings: {},
          },
        );
      }
      return project.livePageControllerBindings;
    case 'scene':
      const scene = project.scenes[context.sceneId.toString()];
      if (!scene) {
        throw Error(`Scene ${context.sceneId} not found`);
      }
      if (!scene.controllerBindings) {
        scene.controllerBindings = create(ControllerBindingsMapSchema, {
          bindings: {},
        });
      }
      return scene.controllerBindings;
  }
}

/**
 * Gets the bindings map for a given context or returns `undefined` if none is present yet.
 */
function getBindingsMap(
  project: Project,
  context: BindingContext,
): ControllerBindingsMap['bindings'] | undefined {
  switch (context.type) {
    case 'live_page':
      return project.livePageControllerBindings?.bindings;
    case 'scene':
      const scene = project.scenes[context.sceneId.toString()];
      if (!scene) {
        throw Error(`Scene ${context.sceneId} not found`);
      }
      return scene.controllerBindings?.bindings;
  }
}

/**
 * Gets the ControllerBindings for a given context, creating if necessary.
 */
function getOrCreateBindings(
  project: Project,
  context: BindingContext,
  bindingId: bigint,
): any {
  const bindingsMap = getOrCreateBindingsMap(project, context).bindings;
  const key = bindingId.toString();

  if (!bindingsMap[key]) {
    bindingsMap[key] = create(ControllerBindingsMap_ControllerBindingsSchema, {
      bindings: {},
    });
  }
  return bindingsMap[key];
}

/**
 * Gets all ancestor contexts for a given context (for upward traversal).
 * Returns contexts from immediate parent to root.
 */
function getAncestorContexts(context: BindingContext): BindingContext[] {
  const ancestors: BindingContext[] = [];

  switch (context.type) {
    case 'live_page':
      // Top of hierarchy - no ancestors
      return [];
    case 'scene':
      // Scenes inherit from global
      ancestors.push({ type: 'live_page' });
      return ancestors;
  }
}

/**
 * Gets all child contexts for a given context (for downward traversal).
 */
function getAllChildContexts(
  project: Project,
  context: BindingContext,
): BindingContext[] {
  switch (context.type) {
    case 'live_page':
      // All scenes are children of global
      return Object.keys(project.scenes).map((sceneId) => ({
        type: 'scene' as const,
        sceneId: BigInt(sceneId),
      }));
    case 'scene':
      return []; // Scenes have no children (yet)
  }
}

/**
 * Determines the appropriate storage context for a binding based on its action type.
 */
function getStorageContext(
  binding: InputBinding,
  currentSceneId: bigint,
): BindingContext {
  switch (binding.action.case) {
    case 'beatMatch':
    case 'firstBeat':
    case 'setTempo':
      return { type: 'live_page' };
    case 'colorPalette':
    case 'tileStrength':
      return { type: 'scene', sceneId: currentSceneId };
    default:
      throw Error(
        'Unrecognized controller action binding: ' + binding.action.case,
      );
  }
}

/**
 * Looks up a binding in the hierarchy, starting from current context and traversing up to parents.
 */
export function findBinding(
  project: Project,
  bindingId: bigint,
  channel: ControllerChannel,
  startContext: BindingContext,
): InputBinding | null {
  const key = bindingId.toString();

  // Check current context first
  const bindingsMap = getBindingsMap(project, startContext);
  if (bindingsMap) {
    const binding = bindingsMap[key]?.bindings[channel];
    if (binding) {
      return binding;
    }
  }

  // Then check all ancestor contexts
  const ancestors = getAncestorContexts(startContext);
  for (const ancestorContext of ancestors) {
    const ancestorBindingsMap = getBindingsMap(project, ancestorContext);
    if (!ancestorBindingsMap) {
      continue;
    }
    const ancestorBinding = ancestorBindingsMap[key]?.bindings[channel];
    if (ancestorBinding) {
      return ancestorBinding;
    }
  }

  return null;
}

/**
 * Takes in details of a controller action and modifies the project accordingly.
 */
export function performAction(
  project: Project,
  bindingId: bigint,
  channel: ControllerChannel,
  value: number,
  cct: ControlCommandType,
  addBeatSample: (t: number) => void,
  setFirstBeat: (t: number) => void,
  setBeat: (durationMs: number) => void,
): boolean {
  const currentContext: BindingContext = {
    type: 'scene',
    sceneId: project.activeScene,
  };

  const binding = findBinding(project, bindingId, channel, currentContext);
  if (!binding) {
    return false;
  }

  const action = binding.action;
  switch (action.case) {
    case 'beatMatch':
      if (binding.inputType === InputType.BINARY && value > 0.5) {
        addBeatSample(new Date().getTime());
      }
      return false;
    case 'firstBeat':
      if (binding.inputType === InputType.BINARY && value > 0.5) {
        setFirstBeat(new Date().getTime());
      }
      return false;
    case 'setTempo':
      const bpm = Math.floor(value * 127 + 80);
      setBeat(60_000 / bpm);
      return true;
    case 'tileStrength':
      return performTileStrength(
        project,
        project.activeScene,
        action.value.tileId,
        value,
        cct,
      );
    case 'colorPalette':
      getActiveScene(project).activeColorPalette = action.value.paletteId;
      return true;
    default:
      return false;
  }
}

/**
 * Assigns an action to a controller channel.
 * Allows multiple channels to have the same action.
 * Removes any existing binding on this specific channel from the active scene's context hierarchy.
 */
export function assignAction(
  project: Project,
  bindingId: bigint,
  channel: ControllerChannel,
  binding: InputBinding,
) {
  const clonedBinding = clone(InputBindingSchema, binding);

  // Determine where to store the binding based on action type
  const storageContext = getStorageContext(clonedBinding, project.activeScene);

  // Delete the old binding
  deleteAction(project, bindingId, channel);

  // Assign the new binding
  const bindings = getOrCreateBindings(project, storageContext, bindingId);
  bindings.bindings[channel] = clonedBinding;
}

/**
 * Returns `true` if the supplied action already exists in the project mapped to any controller channel.
 * Checks the context where the binding would be stored, plus all parent and child contexts.
 */
export function hasAction(
  project: Project,
  bindingId: bigint,
  binding: InputBinding,
): boolean {
  // Determine where this binding would be stored
  const storageContext = getStorageContext(binding, project.activeScene);

  const contextsToCheck = [
    ...getAncestorContexts(storageContext),
    storageContext,
    ...getAllChildContexts(project, storageContext),
  ];

  // Check all collected contexts for conflicts
  for (const context of contextsToCheck) {
    const bindingsMap = getBindingsMap(project, context);
    if (!bindingsMap) {
      continue;
    }
    const bindings = bindingsMap[bindingId.toString()]?.bindings;

    if (bindings) {
      for (const existingBinding of Object.values(bindings) as InputBinding[]) {
        // Compare bindings ignoring inputType field - only compare actions
        if (
          existingBinding.action.case === binding.action.case &&
          equals(InputBindingSchema, existingBinding, binding)
        ) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Deletes a specific binding from a specific channel.
 * leaving other channels with the same action intact.
 */
export function deleteAction(
  project: Project,
  bindingId: bigint,
  channel: ControllerChannel,
): void {
  // Check global bindings
  const globalBindingsMap = project.livePageControllerBindings?.bindings;
  const globalBindings = globalBindingsMap?.[bindingId.toString()]?.bindings;
  if (globalBindings && globalBindings[channel]) {
    delete globalBindings[channel];
    return;
  }

  // Check scene bindings
  const scene = project.scenes[project.activeScene.toString()];
  if (scene) {
    const sceneBindingsMap = scene.controllerBindings?.bindings;
    const sceneBindings = sceneBindingsMap?.[bindingId.toString()]?.bindings;
    if (sceneBindings && sceneBindings[channel]) {
      delete sceneBindings[channel];
      return;
    }
  }
}

/**
 * Deletes all controller bindings given a specific predicate.
 */
export function deleteBindings(
  project: Project,
  predicate: (action: InputBinding['action']) => boolean,
): void {
  // Helper to clean bindings from a ControllerBindingsMap
  const cleanBindingsMap = (bindingsMap: any) => {
    if (!bindingsMap?.bindings) return;

    // Iterate through all controller IDs
    for (const controllerBindings of Object.values(bindingsMap.bindings)) {
      if (!controllerBindings || typeof controllerBindings !== 'object')
        continue;

      const bindings = (controllerBindings as any).bindings;
      if (!bindings) continue;

      // Find and delete channels with tileStrength actions matching this tileId
      for (const [channel, binding] of Object.entries(bindings)) {
        const inputBinding = binding as InputBinding;
        if (predicate(inputBinding.action)) {
          delete bindings[channel];
        }
      }
    }
  };

  // Clean global bindings
  if (project.livePageControllerBindings) {
    cleanBindingsMap(project.livePageControllerBindings);
  }

  // Clean bindings in all scenes
  for (const scene of Object.values(project.scenes)) {
    if (scene.controllerBindings) {
      cleanBindingsMap(scene.controllerBindings);
    }
  }
}

/**
 * Returns all channels across all controllers that have the given action bound.
 * Returns array of {bindingId, channel, context} triples.
 */
export function getAllBindingsForAction(
  project: Project,
  binding: InputBinding,
) {
  const results: Array<{
    bindingId: bigint;
    channel: ControllerChannel;
    context: BindingContext;
  }> = [];

  const storageContext = getStorageContext(binding, project.activeScene);

  // Get all contexts to check (same logic as hasAction)
  const contextsToCheck: BindingContext[] = [
    ...getAncestorContexts(storageContext),
    storageContext,
    ...getAllChildContexts(project, storageContext),
  ];

  for (const context of contextsToCheck) {
    const bindingsMap = getBindingsMap(project, context);
    if (!bindingsMap) {
      continue;
    }

    for (const [id, controllerBindings] of Object.entries(bindingsMap)) {
      if (!controllerBindings?.bindings) {
        continue;
      }
      for (const [channel, existingBinding] of Object.entries(
        controllerBindings.bindings,
      )) {
        if (equals(InputBindingSchema, existingBinding, binding)) {
          results.push({
            bindingId: BigInt(id),
            channel,
            context,
          });
        }
      }
    }
  }

  return results;
}

/**
 * Returns the description of an action mapped to a controller channel.
 */
export function getActionDescription(
  project: Project,
  sceneId: bigint,
  bindingId: bigint,
  channel: ControllerChannel,
) {
  const scene = project.scenes[sceneId.toString()];
  if (!scene) {
    return null;
  }

  // Use the context hierarchy to find the binding
  const context: BindingContext = { type: 'scene', sceneId };
  const binding = findBinding(project, bindingId, channel, context);

  if (binding) {
    switch (binding.action.case) {
      case 'beatMatch':
        return 'Samples the beat during beat-matching.';
      case 'firstBeat':
        return 'Sets the first beat in a bar.';
      case 'setTempo':
        return 'Sets the absolute BPM.';
      case 'colorPalette':
        const paletteId = binding.action.value.paletteId;
        const colorPaletteName = scene.colorPalettes.find(
          (c) => c.id === paletteId,
        )?.name;
        return `Sets the color palette to ${colorPaletteName}.`;
      case 'tileStrength':
        const tileName = scene.tileMap.find(
          (t: any) =>
            t.id === (binding!.action.value as TileStrengthAction).tileId,
        )?.tile?.name;
        return `Modifies the strength of tile "${tileName}".`;
      case undefined:
        return null;
      default:
        throw Error('Unknown action type!');
    }
  }

  return null;
}
