import { create } from '@bufbuild/protobuf';
import {
  ControllerMappingSchema,
  ControllerMapping_ControllerSchema,
  type ControllerMapping_Action,
  type ControllerMapping_TileStrength,
} from '@dmx-controller/proto/controller_pb';
import { type Project } from '@dmx-controller/proto/project_pb';

import {
  ControlCommandType,
  ControllerChannel,
} from '../contexts/ControllerContext';

import { outputTileStrength, performTileStrength } from './tileStrength';

export function performAction(
  project: Project,
  controllerName: string,
  channel: ControllerChannel,
  value: number,
  cct: ControlCommandType,
  addBeatSample: (t: number) => void,
  output: (channel: ControllerChannel, value: number) => void,
) {
  const action =
    project.controllerMapping!.controllers[controllerName]?.actions[channel]
      ?.action;

  switch (action?.case) {
    case 'beatMatch':
      if (cct === null && value > 0.5) {
        addBeatSample(new Date().getTime());
      }
      return false;
    case 'colorPaletteSelection':
      const scene = project.scenes[action.value.scene];
      if (scene.activeColorPalette === action.value.paletteId) {
        return false;
      } else {
        scene.lastActiveColorPalette =
          project.scenes[action.value.scene].activeColorPalette;
        scene.activeColorPalette = action.value.paletteId;
        scene.colorPaletteStartTransition = BigInt(new Date().getTime());
        return true;
      }
    case 'tileStrength':
      return performTileStrength(project, action.value, value, cct);
    default:
      output(channel, value);
      return false;
  }
}

export function assignAction(
  project: Project,
  controllerName: string,
  channel: ControllerChannel,
  action: ControllerMapping_Action,
) {
  deleteAction(project, controllerName, action.action);
  getActionMap(project, controllerName)[channel] = action;
}

export function findAction(
  project: Project,
  controllerName: string,
  action: ControllerMapping_Action['action'],
) {
  return Object.values(getActionMap(project, controllerName))
    .map((a) => a.action)
    .filter((a) => a.case === action.case)
    .find((a) => JSON.stringify(a.value) === JSON.stringify(action.value));
}

export function deleteAction(
  project: Project,
  controllerName: string,
  action: ControllerMapping_Action['action'],
) {
  const controllerActions = getActionMap(project, controllerName);
  for (const channel in controllerActions) {
    const foundAction = controllerActions[channel];
    if (
      foundAction.action.case === action.case &&
      JSON.stringify(foundAction.action.value) === JSON.stringify(action.value)
    ) {
      controllerActions[channel].action = {
        case: undefined,
        value: undefined,
      };
    }
  }
}

export function outputValues(
  project: Project,
  controllerName: string,
  t: bigint,
  output: (channel: ControllerChannel, value: number) => void,
) {
  const actions = Object.entries(
    project.controllerMapping?.controllers[controllerName].actions || {},
  );
  for (const entry of actions) {
    const channel = entry[0];
    const action = entry[1].action;
    let value = 0;
    switch (action.case) {
      case 'beatMatch':
        const beatMetadata = project.liveBeat!;
        const beatT = Number(
          t + BigInt(project.timingOffsetMs) - beatMetadata.offsetMs,
        );
        value = 1 - Math.round((beatT / beatMetadata.lengthMs) % 1);
        break;
      case 'colorPaletteSelection':
        value = 1;
        break;
      case 'tileStrength':
        value = outputTileStrength(project, action.value, t);
        break;
    }
    output(channel, value);
  }
}

export function getActionDescription(
  project: Project,
  controllerName: string,
  channel: ControllerChannel,
) {
  const actionMapping = getActionMap(project, controllerName)[channel];
  switch (actionMapping?.action.case) {
    case 'beatMatch':
      return 'Samples the beat during beat-matching.';
    case 'tileStrength':
      const action: ControllerMapping_TileStrength =
        actionMapping?.action.value!;
      const tile = Array.from(
        project.scenes[action.scene].tileMap.values(),
      ).find((m) => m.id === action.tileId);
      if (tile) {
        return `Toggles the strength of ${tile.tile?.name}.`;
      } else {
        return null;
      }
    default:
      return null;
  }
}

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
