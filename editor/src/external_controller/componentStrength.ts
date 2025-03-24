import { ControllerMapping_Action, ControllerMapping_ComponentStrength } from "@dmx-controller/proto/controller_pb";
import { Project } from "@dmx-controller/proto/project_pb";
import { ControlCommandType } from "../contexts/ControllerContext";
import { componentActiveAmount, toggleComponent } from "../util/component";
import { deleteAction, getActionMap } from "./externalController";

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
      return true;
    } else if (value > 0.5) {
      toggleComponent(componentMapping.component, project.liveBeat!);
      return true;
    }
  }
  return true;
}

export function assignComponentStrength(
  project: Project,
  controllerName: string,
  channel: string,
  action: ControllerMapping_ComponentStrength) {
  deleteAction(project, controllerName, {
    case: 'componentStrength',
    value: action,
  });

  getActionMap(project, controllerName)[channel] = new ControllerMapping_Action({
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