import { ControllerMapping_Action } from "@dmx-controller/proto/controller_pb";
import {
  assignAction,
  deleteAction,
  findAction,
  getActionDescription,
} from "../external_controller/externalController";
import { useContext, useEffect, useMemo, useState } from "react";
import { ProjectContext } from "../contexts/ProjectContext";
import {
  ControlCommandType,
  ControllerChannel,
  ControllerContext,
} from "../contexts/ControllerContext";
import { SiMidi } from "react-icons/si";
import { Project } from "@dmx-controller/proto/project_pb";
import { Modal } from "./Modal";
import { Button, IconButton } from "./Button";

interface ControllerConnectionProps {
  action: ControllerMapping_Action["action"];
  title: string;
  iconOnly?: boolean;
  requiredType?: "slider" | "button";
}

export function ControllerConnection({
  action,
  title,
  iconOnly,
  requiredType,
}: ControllerConnectionProps) {
  const { project, save } = useContext(ProjectContext);
  const { controllerName, addListener, removeListener } =
    useContext(ControllerContext);

  const [mappingControllerInput, setMappingControllerInput] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const existingAction = useMemo(() => {
    if (controllerName) {
      return findAction(project, controllerName, action);
    } else {
      return undefined;
    }
  }, [project, controllerName, action]);

  useEffect(() => {
    if (mappingControllerInput && controllerName) {
      const listener = (
        project: Project,
        channel: ControllerChannel,
        _value: number,
        cct: ControlCommandType,
      ) => {
        setMappingControllerInput(false);
        const existing = getActionDescription(project, controllerName, channel);
        if (cct != null && requiredType === "button") {
          setError("Input must be a button!");
        } else if (cct == null && requiredType === "slider") {
          setError("Input must be a slider!");
        } else if (existing) {
          setError(`Controller already assigned to "${existing}".`);
          return;
        } else {
          assignAction(
            project,
            controllerName,
            channel,
            new ControllerMapping_Action({
              action: action,
            }),
          );
          save("Add MIDI mapping.");
        }
      };
      addListener(listener);
      return () => removeListener(listener);
    }
    return () => {};
  }, [mappingControllerInput, controllerName, action]);

  if (!controllerName) {
    return null;
  }

  return (
    <>
      {iconOnly != false ? (
        <IconButton
          title={title}
          variant={
            mappingControllerInput
              ? "warning"
              : existingAction
                ? "primary"
                : "default"
          }
          onClick={() => {
            if (mappingControllerInput) {
              setMappingControllerInput(false);
            } else if (existingAction && controllerName) {
              deleteAction(project, controllerName, action);
              save("Remove MIDI mapping.");
            } else {
              setMappingControllerInput(true);
            }
          }}
        >
          <SiMidi />
        </IconButton>
      ) : (
        <Button
          icon={<SiMidi />}
          variant={
            mappingControllerInput
              ? "warning"
              : existingAction
                ? "primary"
                : "default"
          }
          onClick={() => {
            if (mappingControllerInput) {
              setMappingControllerInput(false);
            } else if (existingAction && controllerName) {
              deleteAction(project, controllerName, action);
              save("Remove MIDI mapping.");
            } else {
              setMappingControllerInput(true);
            }
          }}
        >
          {title}
        </Button>
      )}
      {error && (
        <Modal
          title="Controller Mapping Error"
          onClose={() => setError(undefined)}
        >
          {error}
        </Modal>
      )}
    </>
  );
}
