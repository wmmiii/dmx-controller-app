import React, { useContext, useMemo, useRef } from "react";

import IconBxBrushAlt from '../icons/IconBxBrush';
import IconBxPlus from '../icons/IconBxPlus';
import styles from "./LightTrack.module.scss";
import { Button, IconButton } from "./Button";
import { LightLayer as LightLayerProto } from '@dmx-controller/proto/light_layer_pb';
import { LightLayer } from '../components/LightLayer';
import { OutputDescription, OutputSelector } from '../components/OutputSelector';
import { ProjectContext } from "../contexts/ProjectContext";
import { Show_LightTrack } from '@dmx-controller/proto/show_pb';

export interface MappingFunctions {
  msToPx: (ms: number) => number;
  pxToMs: (px: number) => number;
  snapToBeat: (t: number) => number;
}

interface LightTrackProps {
  track: Show_LightTrack;
  maxMs: number;
  leftWidth: number;
  mappingFunctions: MappingFunctions;
  forceUpdate: () => void;
}

export function LightTrack({
  track,
  maxMs,
  leftWidth,
  mappingFunctions,
  forceUpdate,
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
        {track.name}
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
      </div>
      <div className={styles.right} ref={trackRef}>
        {
          track.layers.map((l, i) => (
            <LightLayer
              key={i}
              layer={l}
              maxMs={maxMs}
              msToPx={mappingFunctions.msToPx}
              pxToMs={mappingFunctions.pxToMs}
              snapToBeat={mappingFunctions.snapToBeat}
              forceUpdate={forceUpdate} />
          ))
        }
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
      </div>
    </div>
  );
}