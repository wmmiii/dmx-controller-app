import { Project } from "@dmx-controller/proto/project_pb";
import { ControlCommandType, ControllerChannel } from "../contexts/ControllerContext";
import { ControllerMapping, ControllerMapping_Action, ControllerMapping_Controller } from "@dmx-controller/proto/controller_pb";
import { assignComponentStrength, outputComponentStrength, performComponentStrength } from "./componentStrength";

export function performAction(
  project: Project,
  controllerName: string,
  channel: ControllerChannel,
  value: number,
  cct: ControlCommandType) {
  const action = project.controllerMapping!.controllers[controllerName]?.actions[channel]?.action;

  switch (action?.case) {
    case 'componentStrength':
      performComponentStrength(project, action.value, value, cct);
  }
}

export function assignAction(
  project: Project,
  controllerName: string,
  channel: ControllerChannel,
  action: ControllerMapping_Action) {
  if (project.controllerMapping == null) {
    project.controllerMapping = new ControllerMapping();
  }
  if (project.controllerMapping.controllers[controllerName] == null) {
    project.controllerMapping.controllers[controllerName] = new ControllerMapping_Controller();
  }
  const controllerActions = project.controllerMapping.controllers[controllerName].actions;

  switch (action.action.case) {
    case 'componentStrength':
      assignComponentStrength(controllerActions, channel, action.action.value);
  }
}

export function outputValues(
  project: Project,
  controllerName: string,
  t: bigint,
  output: (channel: ControllerChannel, value: number) => void) {
  const actions = Object.entries(project.controllerMapping?.controllers[controllerName].actions || {});
  for (const entry of actions) {
    const channel = entry[0];
    const action = entry[1].action;
    let value = 0;
    switch (action.case) {
      case 'componentStrength':
        value = outputComponentStrength(project, action.value, t);
    }
    output(channel, value);
  }
}

export function getActionDescription(project: Project, controllerName: string, channel: ControllerChannel) {
  const actionMapping = project.controllerMapping?.controllers[controllerName]?.actions[channel];
  const action = actionMapping?.action.value!;
  switch (actionMapping?.action.case) {
    case 'componentStrength':
      const component = Array.from(project.scenes[action.scene].componentMap.values())
        .find(m => m.id === action.componentId);
      if (component) {
        return `Toggles the strength of ${component.component?.name}.`;
      } else {
        return null;
      }
    default:
      return null;
  }
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
