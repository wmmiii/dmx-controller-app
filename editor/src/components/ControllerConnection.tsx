import { type ControllerMapping_Action } from '@dmx-controller/proto/controller_pb';
import { type Project } from '@dmx-controller/proto/project_pb';
import { useContext, useEffect, useMemo, useState } from 'react';
import { SiMidi } from 'react-icons/si';

import {
  ControlCommandType,
  ControllerChannel,
  ControllerContext,
} from '../contexts/ControllerContext';
import { ProjectContext } from '../contexts/ProjectContext';
import {
  assignAction,
  deleteAction,
  getActionDescription,
  hasAction,
} from '../external_controller/externalController';

import { Button, IconButton } from './Button';
import { Modal } from './Modal';

interface ControllerConnectionProps {
  action: ControllerMapping_Action;
  title: string;
  iconOnly?: boolean;
  requiredType?: 'slider' | 'button';
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

  const hasControllerMapping = useMemo(() => {
    if (controllerName) {
      return hasAction(project, controllerName, action);
    } else {
      return false;
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
        const existing = getActionDescription(project, controllerName, channel);
        if (cct != null && requiredType === 'button') {
          setError('Input must be a button!');
        } else if (cct == null && requiredType === 'slider') {
          setError('Input must be a slider!');
        } else if (existing) {
          setError(`Controller already assigned to "${existing}".`);
          return;
        } else if (cct == null || cct == 'msb') {
          assignAction(project, controllerName, channel, action);
          save('Add MIDI mapping.');
          setMappingControllerInput(false);
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
              ? 'warning'
              : hasControllerMapping
                ? 'primary'
                : 'default'
          }
          onClick={() => {
            if (mappingControllerInput) {
              setMappingControllerInput(false);
            } else if (hasControllerMapping && controllerName) {
              deleteAction(project, controllerName, action);
              save('Remove MIDI mapping.');
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
              ? 'warning'
              : hasControllerMapping
                ? 'primary'
                : 'default'
          }
          onClick={() => {
            if (mappingControllerInput) {
              setMappingControllerInput(false);
            } else if (hasControllerMapping && controllerName) {
              deleteAction(project, controllerName, action);
              save('Remove MIDI mapping.');
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
