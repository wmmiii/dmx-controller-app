import { ControllerMapping_ComponentStrength } from "@dmx-controller/proto/controller_pb";
import { Project } from "@dmx-controller/proto/project_pb";
import { ControlCommandType } from "../contexts/ControllerContext";
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
      return true;
    } else if (value > 0.5) {
      toggleComponent(componentMapping.component, project.liveBeat!);
      return true;
    }
  }
  return true;
}

export function outputComponentStrength(project: Project, action: ControllerMapping_ComponentStrength, t: bigint) {
  const component = project.scenes[action.scene].componentMap.find(m => m.id === action.componentId)?.component;
  if (component && project.liveBeat) {
    return componentActiveAmount(component, project.liveBeat, t);
  } else {
    return 0;
  }
}
