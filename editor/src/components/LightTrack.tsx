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
import { TextInput } from "./Input";

export interface MappingFunctions {
  msToPx: (ms: number) => number;
  pxToMs: (px: number) => number;
  snapToBeat: (t: number) => number;
}

interface LightTrackProps {
  track: LightTrackProto;
  maxMs: number;
  leftWidth: number;
  mappingFunctions: MappingFunctions;
  forceUpdate: () => void;
  swapUp?: () => void;
  swapDown?: () => void;
}

export function LightTrack({
  track,
  maxMs,
  leftWidth,
  mappingFunctions,
  forceUpdate,
  swapUp,
  swapDown,
}: LightTrackProps):
  JSX.Element {
  const { project } = useContext(ProjectContext);
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
          <TextInput
            value={track.name}
            onChange={(v) => {
              track.name = v;
              forceUpdate();
            }} />
          <IconButton
            title={track.collapsed ? 'Expand' : 'Collapse'}
            onClick={() => {
              track.collapsed = !track.collapsed;
              forceUpdate();
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
            <OutputSelector
              value={device}
              setValue={(o) => {
                switch (o.type) {
                  case 'fixture':
                    track.output.case = 'physicalFixtureId';
                    break;
                  case 'group':
                    track.output.case = 'physicalFixtureGroupId';
                    break;
                }
                track.output.value = o.id;
                forceUpdate();
              }} />
            <IconButton
              title="Cleanup Empty Layers"
              onClick={() => {
                track.layers = track.layers.filter((l) => l.effects.length > 0);
                forceUpdate();
              }}>
              <IconBxBrushAlt />
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
          </>
        }
      </div>
      <div
        ref={trackRef}
        className={styles.right}
        onClick={() => {
          track.collapsed = false;
          forceUpdate();
        }}>
        {
          track.layers.map((l, i) => (
            <LightLayer
              className={track.collapsed ? styles.collapsedLayer : null}
              key={i}
              layer={l}
              maxMs={maxMs}
              msToPx={mappingFunctions.msToPx}
              pxToMs={mappingFunctions.pxToMs}
              snapToBeat={mappingFunctions.snapToBeat}
              forceUpdate={forceUpdate} />
          ))
        }
        {
          !track.collapsed &&
          <div className={styles.newLayer}>
            <Button
              icon={<IconBxPlus />}
              onClick={() => {
                track.layers.push(new LightLayerProto());
                forceUpdate();
              }}>
              New Layer
            </Button>
          </div>
        }
      </div>
    </div>
  );
}