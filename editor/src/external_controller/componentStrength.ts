import { ControllerMapping_Action, ControllerMapping_ComponentStrength } from "@dmx-controller/proto/controller_pb";
import { Project } from "@dmx-controller/proto/project_pb";
import { ControlCommandType, ControllerChannel } from "../contexts/ControllerContext";
import { componentActiveAmount, toggleComponent } from "../util/component";

export function performComponentStrength(
  project: Project,
  action: ControllerMapping_ComponentStrength,
  value: number,
  cct: ControlCommandType) {
  const componentMapping = project.scenes[action.scene].componentMap.find(c => c.id === action.componentId);
  if (componentMapping && componentMapping.component) {
    if (cct != null) {
      // Fader input.
      componentMapping.component.transition = {
        case: 'absoluteStrength',
        value: value,
      };
    } else if (value > 0.5) {
      toggleComponent(componentMapping.component, project.liveBeat!);
    }
  }
}

export function assignComponentStrength(
  controllerActions: { [channel: ControllerChannel]: ControllerMapping_Action },
  channel: ControllerChannel,
  action: ControllerMapping_ComponentStrength) {
  for (const channel in controllerActions) {
    const foundAction = controllerActions[channel];
    if (foundAction.action.case === 'componentStrength' &&
      JSON.stringify(foundAction.action.value) === JSON.stringify(action)) {
      controllerActions[channel].action = {
        case: undefined,
        value: undefined,
      };
    }
  }

  controllerActions[channel] = new ControllerMapping_Action({
    action: {
      case: 'componentStrength',
      value: action,
    },
  });
}

export function outputComponentStrength(project: Project, action: ControllerMapping_ComponentStrength, t: bigint) {
  const component = project.scenes[action.scene].componentMap.find(m => m.id === action.componentId)?.component;
  if (component && project.liveBeat) {
    return componentActiveAmount(component, project.liveBeat, t);
  } else {
    return 0;
  }
}

export function findComponentStrength(project: Project, controllerName: string, scene: number, componentId: string) {
  if (!componentId) {
    return undefined;
  }
  return Object.values(project.controllerMapping?.controllers[controllerName || '']?.actions || {})
    .map(a => a.action)
    .filter(a => a.case === 'componentStrength')
    .find(a => a.value?.scene === scene && a.value?.componentId === componentId);
}

export function deleteComponentStrength(project: Project, controllerName: string, scene: number, componentId: string) {
  const actions = project.controllerMapping?.controllers[controllerName || '']?.actions;
  if (!actions) {
    return;
  }
  const channel = Object.entries(actions)
    .find(e => {
      if (e[1].action.case === 'componentStrength') {
        const action = e[1].action.value;
        return action.scene === scene && action.componentId === componentId;
      }
      return false;
    });
  if (channel != null) {
    delete actions[channel[0]];
  }
}