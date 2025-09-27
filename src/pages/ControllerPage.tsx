import { JSX, useContext, useEffect, useState } from 'react';

import { Project } from '@dmx-controller/proto/project_pb';
import { BiX } from 'react-icons/bi';
import { ControllerButton, IconButton } from '../components/Button';
import {
  ControlCommandType,
  ControllerChannel,
  ControllerContext,
} from '../contexts/ControllerContext';
import { ProjectContext } from '../contexts/ProjectContext';
import {
  deleteAction,
  getActionDescription,
} from '../external_controller/externalController';
import styles from './ControllerPage.module.scss';

export function ControllerPage(): JSX.Element {
  const { project, save } = useContext(ProjectContext);
  const { controllerName, connect, addListener, removeListener } =
    useContext(ControllerContext);

  const [lastPressed, setLastPressed] = useState<{
    channel: ControllerChannel;
    value: number;
    cct: ControlCommandType;
  } | null>(null);

  const [highlight, setHighlight] = useState<string | null>(null);

  useEffect(() => {
    const listener = (
      _project: Project,
      channel: ControllerChannel,
      value: number,
      cct: ControlCommandType,
    ) => {
      setLastPressed({
        channel,
        value,
        cct,
      });

      setHighlight(channel);
      setTimeout(() => {
        setHighlight(null);
      }, 10);
    };
    addListener(listener);

    return () => removeListener(listener);
  });

  if (!controllerName) {
    return (
      <div className={styles.wrapper}>
        <ControllerButton
          title="Connect to controller"
          midiState="inactive"
          onClick={connect}
        />
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <h2>{controllerName}</h2>
      <div>
        Last input:&nbsp;
        {lastPressed && (
          <>
            {lastPressed.channel} {lastPressed.cct && `(${lastPressed.cct})`}
            &nbsp;
            {lastPressed.value}
          </>
        )}
      </div>
      <table className={styles.mappings}>
        <tbody>
          {Object.entries(
            project.controllerMapping!.controllers[controllerName]?.actions ??
              {},
          )
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([channel, action]) => {
              const name = getActionDescription(
                project,
                project.activeScene,
                controllerName,
                channel,
              );
              switch (action.action.case) {
                case 'beatMatch':
                  return (
                    <tr
                      key={channel}
                      className={highlight === channel ? styles.active : ''}
                    >
                      <td>{channel}</td>
                      <td>Global</td>
                      <td>{name}</td>
                      <td>
                        <IconButton
                          title="Remove mapping"
                          variant="warning"
                          onClick={() => {
                            deleteAction(project, controllerName, action);
                            save(`Delete controller mapping for "${name}".`);
                          }}
                        >
                          <BiX />
                        </IconButton>
                      </td>
                    </tr>
                  );
                case 'sceneMapping':
                  return Object.keys(action.action.value.actions).map(
                    (sceneId) => (
                      <tr
                        key={sceneId}
                        className={highlight === channel ? styles.active : ''}
                      >
                        <td>{channel}</td>
                        <td>{project.scenes[sceneId.toString()].name}</td>
                        <td>
                          {getActionDescription(
                            project,
                            BigInt(sceneId),
                            controllerName,
                            channel,
                          )}
                        </td>
                        <td>
                          <IconButton
                            title="Remove mapping"
                            variant="warning"
                            onClick={() => {
                              deleteAction(project, controllerName, action);
                              save(`Delete controller mapping for "${name}".`);
                            }}
                          >
                            <BiX />
                          </IconButton>
                        </td>
                      </tr>
                    ),
                  );
                default:
                  throw Error('Unknown action type in controller page.');
              }
            })}
        </tbody>
      </table>
    </div>
  );
}
