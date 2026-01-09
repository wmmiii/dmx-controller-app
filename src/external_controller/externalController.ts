import { clone, create, equals } from '@bufbuild/protobuf';
import {
  ControllerMappingSchema,
  ControllerMapping_ActionSchema,
  ControllerMapping_ControllerSchema,
  ControllerMapping_SceneActionSchema,
  type ControllerMapping_Action,
} from '@dmx-controller/proto/controller_pb';
import { type Project } from '@dmx-controller/proto/project_pb';

import {
  ControlCommandType,
  ControllerChannel,
} from '../contexts/ControllerContext';

import { getActiveScene } from '../util/sceneUtils';
import { outputTileStrength, performTileStrength } from './tileStrength';

/**
 * Takes in details of a controller action and modifies the project accordingly.
 */
export function performAction(
  project: Project,
  controllerName: string,
  channel: ControllerChannel,
  value: number,
  cct: ControlCommandType,
  addBeatSample: (t: number) => void,
  setFirstBeat: (t: number) => void,
  setBeat: (durationMs: number) => void,
): boolean {
  const action =
    project.controllerMapping?.controllers[controllerName]?.actions[channel]
      ?.action;

  switch (action?.case) {
    case 'beatMatch':
      if (cct === null && value > 0.5) {
        addBeatSample(new Date().getTime());
      }
      return false;
    case 'firstBeat':
      if (cct === null && value > 0.5) {
        setFirstBeat(new Date().getTime());
      }
      return false;
    case 'setTempo':
      const bpm = Math.floor(value * 127 + 80);
      setBeat(60_000 / bpm);
      return true;
    case 'sceneMapping':
      const sceneAction = action.value.actions[project.activeScene.toString()];
      if (sceneAction) {
        switch (sceneAction.action.case) {
          case 'colorPaletteId':
            getActiveScene(project).activeColorPalette =
              sceneAction.action.value;
            return true;
          case 'tileStrengthId':
            return performTileStrength(
              project,
              sceneAction.action.value,
              value,
              cct,
            );
          default:
            throw Error('Unknown action type in sceneMapping!');
        }
      }
    default:
      return false;
  }
}

/**
 * Assigns an action to a controller channel.
 */
export function assignAction(
  project: Project,
  controllerName: string,
  channel: ControllerChannel,
  a: ControllerMapping_Action,
) {
  const action = clone(ControllerMapping_ActionSchema, a);
  deleteAction(project, controllerName, action);
  const actionMap = getActionMap(project, controllerName);
  switch (action.action.case) {
    case 'sceneMapping':
      const existingAction = actionMap[channel];
      if (existingAction?.action.case === 'sceneMapping') {
        existingAction.action.value.actions[project.activeScene.toString()] =
          action.action.value.actions[project.activeScene.toString()];
      } else {
        actionMap[channel] = action;
      }
      break;
    default:
      actionMap[channel] = action;
  }
}

/**
 * Returns `true` if the supplied action already exists in the project mapped to any controller channel.
 */
export function hasAction(
  project: Project,
  controllerName: string,
  action: ControllerMapping_Action,
): boolean {
  const actionMap = getActionMap(project, controllerName);
  switch (action.action.case) {
    case 'sceneMapping':
      const newSceneAction =
        action.action.value.actions[project.activeScene.toString()];
      if (!newSceneAction) {
        throw Error('Action passed to hasAction not in current scene!');
      }

      for (const a of Object.values(actionMap)) {
        if (a.action.case === 'sceneMapping') {
          const existingSceneAction =
            a.action.value.actions[project.activeScene.toString()];
          if (existingSceneAction) {
            if (
              equals(
                ControllerMapping_SceneActionSchema,
                newSceneAction,
                existingSceneAction,
              )
            ) {
              return true;
            }
          }
        }
      }
      return false;
    default:
      return (
        Object.values(actionMap).find((a) =>
          equals(ControllerMapping_ActionSchema, a, action),
        ) != null
      );
  }
}

/**
 * Finds an action on any controller channel and deletes it once found.
 */
export function deleteAction(
  project: Project,
  controllerName: string,
  action: ControllerMapping_Action,
) {
  const actionMap = getActionMap(project, controllerName);

  if (action.action.case === 'sceneMapping') {
    for (const [channel, existingAction] of Object.entries(actionMap)) {
      if (existingAction.action.case === 'sceneMapping') {
        const existingSceneAction =
          existingAction.action.value.actions[project.activeScene.toString()];
        const newSceneAction =
          action.action.value.actions[project.activeScene.toString()];
        if (existingSceneAction) {
          if (
            equals(
              ControllerMapping_SceneActionSchema,
              existingSceneAction,
              newSceneAction,
            )
          ) {
            delete existingAction.action.value.actions[
              project.activeScene.toString()
            ];
            if (Object.keys(existingAction.action.value.actions).length === 0) {
              delete actionMap[channel];
            }
          }
        }
      }
    }
  } else {
    for (const [channel, existingAction] of Object.entries(actionMap)) {
      if (equals(ControllerMapping_ActionSchema, existingAction, action)) {
        delete actionMap[channel];
      }
    }
  }
}

/**
 * Outputs the current state of the project to the controller.
 */
export function outputValues(
  project: Project,
  controllerName: string,
  t: bigint,
): Map<string, number> {
  const values = new Map<string, number>();
  if (!controllerName) {
    return values;
  }
  const actions = Object.entries(
    project.controllerMapping?.controllers[controllerName]?.actions ?? {},
  );
  for (const [channel, action] of actions) {
    let value = 0;
    const beatMetadata = project.liveBeat!;
    const beatT = Number(t - beatMetadata.offsetMs);
    switch (action.action.case) {
      case 'beatMatch':
        value = 1 - Math.round((beatT / beatMetadata.lengthMs) % 1);
        break;
      case 'firstBeat':
        value = 1 - Math.round(((beatT / beatMetadata.lengthMs) % 4) / 4);
        break;
      case 'setTempo':
        value = Math.floor((60_000 / beatMetadata.lengthMs - 80) / 127);
        break;
      case 'sceneMapping':
        const sceneAction =
          action.action.value.actions[project.activeScene.toString()]?.action;
        if (sceneAction) {
          switch (sceneAction.case) {
            case 'colorPaletteId':
              value = 1;
              break;
            case 'tileStrengthId':
              value = outputTileStrength(project, sceneAction.value, t);
              break;
            default:
              throw Error('Unknown action type in sceneMapping!');
          }
        }
        break;
      case undefined:
        break;
      default:
        throw Error('Unknown action type!');
    }
    values.set(channel, Math.max(Math.min(value, 1), 0));
  }
  return values;
}

/**
 * Returns the description of an action mapped to a controller channel.
 */
export function getActionDescription(
  project: Project,
  sceneId: bigint,
  controllerName: string,
  channel: ControllerChannel,
) {
  const actionMapping = getActionMap(project, controllerName)[channel];
  switch (actionMapping?.action.case) {
    case 'beatMatch':
      return 'Samples the beat during beat-matching.';
    case 'firstBeat':
      return 'Sets the first beat in a bar.';
    case 'setTempo':
      return 'Sets the absolute BPM.';
    case 'sceneMapping':
      const sceneMapping = actionMapping.action.value;
      const sceneAction = sceneMapping.actions[sceneId.toString()]?.action;
      switch (sceneAction?.case) {
        case 'colorPaletteId':
          const colorPaletteName =
            getActiveScene(project).colorPalettes[sceneAction.value.toString()]
              .name;
          return `Sets the color palette to ${colorPaletteName}.`;
        case 'tileStrengthId':
          const tileName = getActiveScene(project).tileMap.find(
            (t) => t.id === sceneAction.value,
          )?.tile?.name;
          return `Modifies the strength of tile "${tileName}".`;
        case undefined:
          return null;
        default:
          throw Error('Unknown type in sceneMapping!');
      }
    case undefined:
      return null;
    default:
      throw Error('Unknown action type!');
  }
}

/**
 * Utility to get the action map for the current project and scene.
 */
export function getActionMap(project: Project, controllerName: string) {
  if (project.controllerMapping == null) {
    project.controllerMapping = create(ControllerMappingSchema, {});
  }
  if (project.controllerMapping.controllers[controllerName] == null) {
    project.controllerMapping.controllers[controllerName] = create(
      ControllerMapping_ControllerSchema,
      { actions: {} },
    );
  }
  return project.controllerMapping.controllers[controllerName].actions;
}

let timeoutHandle: any;
/**
 * Debounces input based on the control command type of a controller input.
 */
export function debounceInput(cct: ControlCommandType, action: () => void) {
  if (cct === 'lsb' || cct === null) {
    clearTimeout(timeoutHandle);
    action();
  } else if (cct === 'msb') {
    // Wait for lsb to see if this channel supports it.
    timeoutHandle = setTimeout(() => action, 100);
  } else {
    throw Error(`Unknown control command type ${cct}!`);
  }
}
