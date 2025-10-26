import { create } from '@bufbuild/protobuf';
import { JSX, createRef, useContext } from 'react';
import {
  OutputSelector,
  getOutputTargetName,
} from '../components/OutputSelector';
import { ProjectContext } from '../contexts/ProjectContext';

import { LayerSchema, TimecodedEffect } from '@dmx-controller/proto/effect_pb';
import { Show_Output } from '@dmx-controller/proto/show_pb';
import {
  BiBrushAlt,
  BiChevronDown,
  BiChevronUp,
  BiPlus,
  BiTrash,
} from 'react-icons/bi';
import { Button, IconButton } from './Button';
import { Layer } from './Layer';
import styles from './LightTrack.module.scss';

export interface MappingFunctions {
  msWidthToPxWidth: (ms: number) => number;
  msToPx: (ms: number) => number;
  pxToMs: (px: number) => number;
  snapToBeat: (t: number) => number;
}

interface LightTrackProps {
  output: Show_Output;
  selectedEffect: TimecodedEffect | null;
  setSelectedEffect: (e: TimecodedEffect | null) => void;
  copyEffect: TimecodedEffect | null;
  maxMs: number;
  leftWidth: number;
  mappingFunctions: MappingFunctions;
  deleteTrack: () => void;
  swapUp?: () => void;
  swapDown?: () => void;
}

export function LightTrack({
  output,
  selectedEffect,
  setSelectedEffect,
  copyEffect,
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
            value={output.outputTarget}
            setValue={(o) => {
              output.outputTarget = o;
              const name = getOutputTargetName(project, o);
              if (name === '<Unset>') {
                save(`Unset track output.`);
              } else {
                save(`Set track output to ${name}.`);
              }
            }}
          />
          <IconButton
            title={output.collapsed ? 'Expand' : 'Collapse'}
            onClick={() => {
              output.collapsed = !output.collapsed;
              save(
                `${output.collapsed ? 'Collapse' : 'Expand'} track ${getOutputTargetName(project, output.outputTarget)}.`,
              );
            }}
          >
            {output.collapsed ? <BiChevronDown /> : <BiChevronUp />}
          </IconButton>
        </div>
        {!output.collapsed && (
          <>
            <div className={styles.buttons}>
              <IconButton
                title="Cleanup Empty Layers"
                onClick={() => {
                  output.layers = output.layers.filter(
                    (l) => l.effects.length > 0,
                  );
                  save(
                    `Cleanup empty layers for track ${getOutputTargetName(project, output.outputTarget)}`,
                  );
                }}
              >
                <BiBrushAlt />
              </IconButton>
              <IconButton title="Delete Track" onClick={deleteTrack}>
                <BiTrash />
              </IconButton>
              {swapUp && (
                <IconButton title="Move Up" onClick={swapUp}>
                  <BiChevronUp />
                </IconButton>
              )}
              {swapDown && (
                <IconButton title="Move Down" onClick={swapDown}>
                  <BiChevronDown />
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
          output.collapsed = false;
          save(
            `Expand track ${getOutputTargetName(project, output.outputTarget)}`,
          );
        }}
      >
        {output.layers.map((l, i) => (
          <Layer
            className={output.collapsed ? styles.collapsedLayer : undefined}
            key={i}
            layer={l}
            selectedEffect={selectedEffect}
            setSelectedEffect={setSelectedEffect}
            copyEffect={copyEffect}
            maxMs={maxMs}
            msToPx={mappingFunctions.msToPx}
            pxToMs={mappingFunctions.pxToMs}
            snapToBeat={mappingFunctions.snapToBeat}
          />
        ))}
        {!output.collapsed && (
          <div className={styles.newLayer}>
            <Button
              icon={<BiPlus />}
              onClick={() => {
                output.layers.push(create(LayerSchema, {}));
                save('Create new output.');
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
