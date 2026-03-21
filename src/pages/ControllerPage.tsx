import { JSX, useContext, useEffect, useState } from 'react';

import { Project } from '@dmx-controller/proto/project_pb';
import { BiUnlink, BiX } from 'react-icons/bi';
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
  const { connectedDevices, connect, disconnect, addListener, removeListener } =
    useContext(ControllerContext);

  const [lastPressed, setLastPressed] = useState<{
    deviceName: string;
    channel: ControllerChannel;
    value: number;
    cct: ControlCommandType;
  } | null>(null);

  const [highlight, setHighlight] = useState<ControllerChannel | null>(null);

  useEffect(() => {
    const listener = (
      _project: Project,
      bindingId: bigint,
      channel: ControllerChannel,
      value: number,
      cct: ControlCommandType,
    ) => {
      const device = connectedDevices.find((d) => d.bindingId === bindingId);
      setLastPressed({
        deviceName: device?.name ?? 'Unknown',
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

  // Collect all bindings from all connected devices
  const allBindings: Array<{
    deviceName: string;
    bindingId: bigint;
    title: string | null;
    channel: string;
    context: BindingContext;
  }> = [];

  for (const device of connectedDevices) {
    // Add global bindings
    const globalBindings =
      project.livePageControllerBindings?.bindings[
        device.bindingId.toString()
      ];
    if (globalBindings) {
      Object.keys(globalBindings.bindings).forEach((channel) => {
        allBindings.push({
          deviceName: device.name,
          bindingId: device.bindingId,
          title: getActionDescription(
            project,
            0n,
            device.bindingId,
            channel,
          ),
          channel,
          context: { type: 'live_page' },
        });
      });
    }

    for (const [sceneId, scene] of Object.entries(project.scenes)) {
      if (scene) {
        const sceneBindings =
          scene.controllerBindings?.bindings[device.bindingId.toString()];
        if (sceneBindings) {
          Object.keys(sceneBindings.bindings).forEach((channel) => {
            allBindings.push({
              deviceName: device.name,
              bindingId: device.bindingId,
              title: getActionDescription(
                project,
                BigInt(sceneId),
                device.bindingId,
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
  }

  return (
    <div className={styles.wrapper}>
      <ControllerButton
        title="Connect a controller"
        midiState={connectedDevices.length > 0 ? 'active' : 'inactive'}
        onClick={connect}
      />
      {connectedDevices.length > 0 && (
        <div>
          <h3>Connected Devices</h3>
          {connectedDevices.map((device) => (
            <div key={device.name}>
              <strong>{device.name}</strong>
              <IconButton
                title={`Disconnect ${device.name}`}
                variant="warning"
                onClick={() => disconnect(device.name)}
              >
                <BiUnlink />
              </IconButton>
            </div>
          ))}
        </div>
      )}
      <div>
        Last input:&nbsp;
        {lastPressed && (
          <>
            [{lastPressed.deviceName}] {lastPressed.channel}{' '}
            {lastPressed.cct && `(${lastPressed.cct})`}
            &nbsp;
            {lastPressed.value}
          </>
        )}
      </div>
      {allBindings.length > 0 && (
        <table className={styles.mappings}>
          <thead>
            <tr>
              <th>Device</th>
              <th>MIDI Channel</th>
              <th>Location</th>
              <th>Description</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {allBindings
              .sort((a, b) => a.channel.localeCompare(b.channel))
              .map(({ deviceName, bindingId, channel, title, context }) => {
                return (
                  <tr
                    key={`${bindingId}-${channel}-${context.type}`}
                    className={highlight === channel ? styles.active : ''}
                  >
                    <td>{deviceName}</td>
                    <td>{channel}</td>
                    <td>{contextName(project, context)}</td>
                    <td>{title}</td>
                    <td>
                      <IconButton
                        title="Remove mapping"
                        variant="warning"
                        onClick={() => {
                          deleteAction(project, bindingId, channel);
                          save(
                            `Delete controller mapping for "${deviceName}".`,
                          );
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
      )}
    </div>
  );
}
