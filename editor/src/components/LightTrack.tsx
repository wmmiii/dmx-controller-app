import React, { useContext, useMemo, useRef } from "react";

import IconBxBrushAlt from '../icons/IconBxBrush';
import IconBxChevronDown from "../icons/IconBxChevronDown";
import IconBxChevronUp from "../icons/IconBxChevronUp";
import IconBxPlus from '../icons/IconBxPlus';
import styles from "./LightTrack.module.scss";
import { Button, IconButton } from "./Button";
import { LightLayer as LightLayerProto } from '@dmx-controller/proto/light_layer_pb';
import { LightLayer } from '../components/LightLayer';
import { LightTrack as LightTrackProto } from '@dmx-controller/proto/light_track_pb';
import { OutputDescription, OutputSelector } from '../components/OutputSelector';
import { ProjectContext } from "../contexts/ProjectContext";
import IconBxX from "../icons/IconBxX";
import { Project } from "@dmx-controller/proto/project_pb";

export interface MappingFunctions {
  msToPx: (ms: number) => number;
  pxToMs: (px: number) => number;
  snapToBeat: (t: number) => number;
}

interface LightTrackProps {
  trackIndex: number;
  track: LightTrackProto;
  maxMs: number;
  leftWidth: number;
  mappingFunctions: MappingFunctions;
  deleteTrack: () => void;
  swapUp?: () => void;
  swapDown?: () => void;
}

export function LightTrack({
  trackIndex,
  track,
  maxMs,
  leftWidth,
  mappingFunctions,
  deleteTrack,
  swapUp,
  swapDown,
}: LightTrackProps):
  JSX.Element {
  const { project, save } = useContext(ProjectContext);
  const trackRef = useRef<HTMLDivElement>();

  const device: OutputDescription = useMemo(() => {
    switch (track.output.case) {
      case 'physicalFixtureId':
        return {
          id: track.output.value,
          type: 'fixture',
        };
      case 'physicalFixtureGroupId':
        return {
          id: track.output.value,
          type: 'group',
        };
    }
  }, [project, track]);

  return (
    <div className={styles.lightTrack}>
      <div className={styles.left} style={{ width: leftWidth }}>
        <div className={styles.header}>
          <OutputSelector
            value={device}
            setValue={(o) => {
              if (o == null) {
                track.output.case = undefined;
                track.output.value = undefined;
              } else {
                switch (o.type) {
                  case 'fixture':
                    track.output.case = 'physicalFixtureId';
                    break;
                  case 'group':
                    track.output.case = 'physicalFixtureGroupId';
                    break;
                }
                track.output.value = o.id;
              }
              save(`Set track output to ${getOutputName(project, track.output)}.`);
            }} />
          <IconButton
            title={track.collapsed ? 'Expand' : 'Collapse'}
            onClick={() => {
              track.collapsed = !track.collapsed;
              save(`${track.collapsed ? 'Collapse' : 'Expand'} track ${getOutputName(project, track.output)}.`);
            }}>
            {
              track.collapsed ?
                <IconBxChevronDown /> :
                <IconBxChevronUp />
            }
          </IconButton>
        </div>
        {
          !track.collapsed &&
          <>
            <div className={styles.buttons}>
              <IconButton
                title="Cleanup Empty Layers"
                onClick={() => {
                  track.layers = track.layers.filter((l) => l.effects.length > 0);
                  save(`Cleanup empty layers for track ${getOutputName(project, track.output)}`);
                }}>
                <IconBxBrushAlt />
              </IconButton>
              <IconButton
                title="Delete Track"
                onClick={deleteTrack}>
                <IconBxX />
              </IconButton>
              {
                swapUp && <IconButton
                  title="Move Up"
                  onClick={swapUp}>
                  <IconBxChevronUp />
                </IconButton>
              }
              {
                swapDown && <IconButton
                  title="Move Down"
                  onClick={swapDown}>
                  <IconBxChevronUp />
                </IconButton>
              }
            </div>
          </>
        }
      </div>
      <div
        ref={trackRef}
        className={styles.right}
        onClick={() => {
          track.collapsed = false;
          save(`Expand track ${getOutputName(project, track.output)}`);
        }}>
        {
          track.layers.map((l, i) => (
            <LightLayer
              className={track.collapsed ? styles.collapsedLayer : null}
              key={i}
              trackIndex={trackIndex}
              layerIndex={i}
              layer={l}
              maxMs={maxMs}
              msToPx={mappingFunctions.msToPx}
              pxToMs={mappingFunctions.pxToMs}
              snapToBeat={mappingFunctions.snapToBeat} />
          ))
        }
        {
          !track.collapsed &&
          <div className={styles.newLayer}>
            <Button
              icon={<IconBxPlus />}
              onClick={() => {
                track.layers.push(new LightLayerProto());
                save('Create new track.');
              }}>
              New Layer
            </Button>
          </div>
        }
      </div>
    </div>
  );
}

function getOutputName(project: Project, output: LightTrackProto['output']) {
  switch (output?.case) {
    case 'physicalFixtureId':
      return project.physicalFixtures[output.value].name;
    case 'physicalFixtureGroupId':
      return project.physicalFixtureGroups[output.value].name;
    default:
      return '<Unset>';
  }
}