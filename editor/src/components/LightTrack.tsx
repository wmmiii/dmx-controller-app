import React, { useCallback, useContext, useMemo, useRef } from "react";

import IconBxBrushAlt from '../icons/IconBxBrush';
import IconBxPlus from '../icons/IconBxPlus';
import styles from "./LightTrack.module.scss";
import { Button, IconButton } from "./Button";
import { LightLayer } from '../components/LightLayer';
import { OutputDescription, OutputSelector } from '../components/OutputSelector';
import { ProjectContext } from "../contexts/ProjectContext";
import { Show_LightLayer, Show_LightTrack } from '@dmx-controller/proto/show_pb';

interface LightTrackProps {
  track: Show_LightTrack;
  leftWidth: number;
  visible: { startMs: number, endMs: number };
  nearestBeat?: (ms: number) => number;
  forceUpdate: () => void;
}

export function LightTrack({
  track,
  leftWidth,
  visible,
  nearestBeat,
  forceUpdate,
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

  const msToPx = useCallback((ms: number) => {
    if (trackRef.current) {
      const bounding = trackRef.current.getBoundingClientRect();
      return ((ms - visible.startMs) * bounding.width) /
        (visible.endMs - visible.startMs);
    }
    return 0;
  }, [visible, trackRef.current]);

  const beatSnapRangeMs = useMemo(() => {
    if (trackRef.current) {
      const bounding = trackRef.current.getBoundingClientRect();
      return Math.floor(
        10 * (visible.endMs - visible.startMs) / bounding.width);
    }
    return 0;
  }, [visible, trackRef.current]);

  const pxToMs = useCallback((px: number) => {
    if (trackRef.current) {
      const bounding = trackRef.current.getBoundingClientRect();
      return Math.floor(((px - bounding.left) / bounding.width) *
        (visible.endMs - visible.startMs) + visible.startMs);
    }
    return 0;
  }, [visible, nearestBeat, beatSnapRangeMs, trackRef.current]);

  const snapToBeat = useCallback((t: number) => {
    if (nearestBeat) {
      const beat = nearestBeat(t);
      if (Math.abs(beat - t) < beatSnapRangeMs) {
        return beat;
      }
    }
    return t;
  }, [nearestBeat, beatSnapRangeMs]);

  return (
    <div className={styles.lightTrack}>
      <div className={styles.left} style={{ width: leftWidth }}>
        {track.name}
        <OutputSelector
          value={device}
          setValue={(device) => {
            switch (device.type) {
              case 'fixture':
                track.output.case = 'physicalFixtureId';
                break;
              case 'group':
                track.output.case = 'physicalFixtureGroupId';
                break;
            }
            track.output.value = device.id;
            save();
          }} />
        <IconButton
          title="Cleanup Empty Layers"
          onClick={() => {
            track.layers = track.layers.filter((l) => l.effects.length > 0);
            save();
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
              msToPx={msToPx}
              pxToMs={pxToMs}
              snapToBeat={snapToBeat}
              forceUpdate={forceUpdate} />
          ))
        }
        <div className={styles.newLayer}>
          <Button
            icon={<IconBxPlus />}
            onClick={() => {
              track.layers.push(new Show_LightLayer());
              save();
            }}>
            New Layer
          </Button>
        </div>
      </div>
    </div>
  );
}