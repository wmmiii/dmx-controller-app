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
  BindingContext,
  contextName,
  deleteAction,
  getActionDescription,
} from '../external_controller/externalController';
import styles from './ControllerPage.module.scss';

export function ControllerPage(): JSX.Element {
  const { project, save } = useContext(ProjectContext);
  const { controllerName, bindingId, connect, addListener, removeListener } =
    useContext(ControllerContext);

  const [lastPressed, setLastPressed] = useState<{
    channel: ControllerChannel;
    value: number;
    cct: ControlCommandType;
  } | null>(null);

  const [highlight, setHighlight] = useState<ControllerChannel | null>(null);

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

  if (!controllerName || !bindingId) {
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

  // Collect all bindings (global and scene-specific)
  const allBindings: Array<{
    title: string | null;
    channel: string;
    context: BindingContext;
  }> = [];

  // Add global bindings
  const globalBindings =
    project.livePageControllerBindings?.bindings[bindingId.toString()];
  if (globalBindings) {
    Object.keys(globalBindings.bindings).forEach((channel) => {
      allBindings.push({
        title: getActionDescription(project, 0n, bindingId, channel),
        channel,
        context: { type: 'live_page' },
      });
    });
  }

  for (const [sceneId, scene] of Object.entries(project.scenes)) {
    if (scene) {
      const sceneBindings =
        scene.controllerBindings?.bindings[bindingId.toString()];
      if (sceneBindings) {
        Object.keys(sceneBindings.bindings).forEach((channel) => {
          allBindings.push({
            title: getActionDescription(
              project,
              BigInt(sceneId),
              bindingId,
              channel,
            ),
            channel,
            context: {
              type: 'scene',
              sceneId: BigInt(sceneId),
            },
          });
        });
      }
    }
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
        <thead>
          <tr>
            <th>MIDI Channel</th>
            <th>Location</th>
            <th>Description</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {allBindings
            .sort((a, b) => a.channel.localeCompare(b.channel))
            .map(({ channel, title, context }) => {
              return (
                <tr
                  key={channel + context}
                  className={highlight === channel ? styles.active : ''}
                >
                  <td>{channel}</td>
                  <td>{contextName(project, context)}</td>
                  <td>{title}</td>
                  <td>
                    <IconButton
                      title="Remove mapping"
                      variant="warning"
                      onClick={() => {
                        deleteAction(project, bindingId, channel);
                        save(`Delete controller mapping for "${name}".`);
                      }}
                    >
                      <BiX />
                    </IconButton>
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}
