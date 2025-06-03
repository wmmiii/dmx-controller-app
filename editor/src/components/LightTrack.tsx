import { create } from '@bufbuild/protobuf';
import { LightLayerSchema } from '@dmx-controller/proto/light_layer_pb';
import { type LightTrack as LightTrackProto } from '@dmx-controller/proto/light_track_pb';
import { JSX, createRef, useContext } from 'react';

import { LightLayer } from '../components/LightLayer';
import { OutputSelector, getOutputName } from '../components/OutputSelector';
import { ProjectContext } from '../contexts/ProjectContext';
import IconBxBrushAlt from '../icons/IconBxBrush';
import IconBxChevronDown from '../icons/IconBxChevronDown';
import IconBxChevronUp from '../icons/IconBxChevronUp';
import IconBxPlus from '../icons/IconBxPlus';
import IconBxX from '../icons/IconBxX';

import { Button, IconButton } from './Button';
import styles from './LightTrack.module.scss';

export interface MappingFunctions {
  msWidthToPxWidth: (ms: number) => number;
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
}: LightTrackProps): JSX.Element {
  const { project, save } = useContext(ProjectContext);
  const trackRef = createRef<HTMLDivElement>();

  return (
    <div className={styles.lightTrack}>
      <div className={styles.left} style={{ width: leftWidth }}>
        <div className={styles.header}>
          <OutputSelector
            value={track.outputId}
            setValue={(o) => {
              track.outputId = o;
              const name = getOutputName(project, o);
              if (name === '<Unset>') {
                save(`Unset track output.`);
              } else {
                save(`Set track output to ${name}.`);
              }
            }}
          />
          <IconButton
            title={track.collapsed ? 'Expand' : 'Collapse'}
            onClick={() => {
              track.collapsed = !track.collapsed;
              save(
                `${track.collapsed ? 'Collapse' : 'Expand'} track ${getOutputName(project, track.outputId)}.`,
              );
            }}
          >
            {track.collapsed ? <IconBxChevronDown /> : <IconBxChevronUp />}
          </IconButton>
        </div>
        {!track.collapsed && (
          <>
            <div className={styles.buttons}>
              <IconButton
                title="Cleanup Empty Layers"
                onClick={() => {
                  track.layers = track.layers.filter(
                    (l) => l.effects.length > 0,
                  );
                  save(
                    `Cleanup empty layers for track ${getOutputName(project, track.outputId)}`,
                  );
                }}
              >
                <IconBxBrushAlt />
              </IconButton>
              <IconButton title="Delete Track" onClick={deleteTrack}>
                <IconBxX />
              </IconButton>
              {swapUp && (
                <IconButton title="Move Up" onClick={swapUp}>
                  <IconBxChevronUp />
                </IconButton>
              )}
              {swapDown && (
                <IconButton title="Move Down" onClick={swapDown}>
                  <IconBxChevronUp />
                </IconButton>
              )}
            </div>
          </>
        )}
      </div>
      <div
        ref={trackRef}
        className={styles.right}
        onClick={() => {
          track.collapsed = false;
          save(`Expand track ${getOutputName(project, track.outputId)}`);
        }}
      >
        {track.layers.map((l, i) => (
          <LightLayer
            className={track.collapsed ? styles.collapsedLayer : undefined}
            key={i}
            trackIndex={trackIndex}
            layerIndex={i}
            layer={l}
            maxMs={maxMs}
            msToPx={mappingFunctions.msToPx}
            pxToMs={mappingFunctions.pxToMs}
            snapToBeat={mappingFunctions.snapToBeat}
          />
        ))}
        {!track.collapsed && (
          <div className={styles.newLayer}>
            <Button
              icon={<IconBxPlus />}
              onClick={() => {
                track.layers.push(create(LightLayerSchema, {}));
                save('Create new track.');
              }}
            >
              New Layer
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
