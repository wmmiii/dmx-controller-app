import { create } from '@bufbuild/protobuf';
import { DdpOutput } from '@dmx-controller/proto/ddp_pb';
import {
  PhysicalSegment,
  PhysicalSegment_LineSchema,
  PhysicalSegment_RectangleSchema,
  PhysicalSegmentSchema,
} from '@dmx-controller/proto/pixel_mapping_pb';
import React, { useContext } from 'react';
import { Button } from '../../components/Button';
import { NumberInput, TextInput } from '../../components/Input';
import { Select } from '../../components/Select';
import { ProjectContext } from '../../contexts/ProjectContext';
import { deleteDdpSegment } from '../../engine/display';
import { getOutput } from '../../util/projectUtils';
import { OutputFrame } from './OutputFrame';

interface DdpEditorProps {
  outputId: bigint;
}

export function DdpEditor({ outputId }: DdpEditorProps) {
  const { project, save } = useContext(ProjectContext);

  const output = getOutput(project, outputId);
  const ddpOutput = output.output.value as DdpOutput;

  // Ensure mapping_2d exists
  if (ddpOutput.segments.length === 0) {
    ddpOutput.segments.push(
      create(PhysicalSegmentSchema, {
        shape: {
          case: 'line',
          value: {
            length: 0,
          },
        },
      }),
    );
  }

  const totalPixels = ddpOutput.segments
    .map((s) => {
      switch (s.shape.case) {
        case 'line':
          return s.shape.value.length;
        case 'rectangle':
          return s.shape.value.width * s.shape.value.height;
        default:
          return 0;
      }
    })
    .reduce((a, b) => a + b);

  return (
    <OutputFrame
      outputEnabled={output.enabled}
      setOutputEnabled={(enabled) => {
        output.enabled = enabled;
        save(`${enabled ? 'Enabled' : 'Disabled'} output "${output.name}".`);
      }}
      fps={output.fps}
      setFps={(fps) => {
        output.fps = fps;
        save(`Set FPS for ${output.name} to ${fps}.`);
      }}
      settings={
        <>
          <label>
            <span>IP Address</span>
            <TextInput
              value={ddpOutput.ipAddress}
              onChange={(ipAddress) => {
                ddpOutput.ipAddress = ipAddress;
                save(
                  `Update address of DDP device ${output.name} to ${ipAddress}.`,
                );
              }}
            />
          </label>
          {ddpOutput.segments.map((s, i) => (
            <React.Fragment key={i}>
              <h3>Segment {i + 1} </h3>
              <Button
                variant="warning"
                onClick={() => {
                  deleteDdpSegment(project, outputId, i);
                  save(`Delete segment ${i + 1} from ${output.name}.`);
                }}
              >
                Delete Segment {i + 1}
              </Button>
              <DdpSegment
                save={(description) =>
                  save(
                    `Update segment ${i + 1} of ${output.name}: ${description}`,
                  )
                }
                segment={s}
              />
            </React.Fragment>
          ))}
        </>
      }
    >
      <Button
        onClick={() => {
          ddpOutput.segments.push(
            create(PhysicalSegmentSchema, {
              shape: {
                case: 'line',
                value: { length: 1 },
              },
            }),
          );
          save(`Add segment to ${output.name}.`);
        }}
      >
        + Add Segment
      </Button>
      <p>Total pixels: {totalPixels}</p>
    </OutputFrame>
  );
}

interface DdpSegmentProps {
  save: (description: string) => void;
  segment: PhysicalSegment;
}

type SegmentType = 'line' | 'rectangle';

const SEGMENT_TYPE_OPTIONS: { value: SegmentType; label: string }[] = [
  { value: 'line', label: 'Line' },
  { value: 'rectangle', label: 'Rectangle' },
];

function DdpSegment({ save, segment }: DdpSegmentProps) {
  const shape = segment.shape;

  const handleTypeChange = (newType: SegmentType) => {
    if (newType === shape.case) {
      return;
    }

    if (newType === 'line') {
      segment.shape = {
        case: 'line',
        value: create(PhysicalSegment_LineSchema, { length: 1 }),
      };
    } else {
      segment.shape = {
        case: 'rectangle',
        value: create(PhysicalSegment_RectangleSchema, { width: 1, height: 1 }),
      };
    }
    save(`Changed segment type to ${newType}.`);
  };

  return (
    <>
      <label>
        <span>Type</span>
        <Select
          value={shape.case ?? 'line'}
          onChange={handleTypeChange}
          options={SEGMENT_TYPE_OPTIONS}
        />
      </label>
      {shape.case === 'line' && (
        <label>
          <span>Length</span>
          <NumberInput
            mode="integer"
            value={shape.value.length}
            onChange={(length) => {
              shape.value.length = length;
              save(`Set length to ${length}.`);
            }}
          />
        </label>
      )}
      {shape.case === 'rectangle' && (
        <>
          <label>
            <span>Width</span>
            <NumberInput
              mode="integer"
              value={shape.value.width}
              onChange={(width) => {
                shape.value.width = width;
                save(`Set width to ${width}.`);
              }}
            />
          </label>
          <label>
            <span>Height</span>
            <NumberInput
              mode="integer"
              value={shape.value.height}
              onChange={(height) => {
                shape.value.height = height;
                save(`Set height to ${height}.`);
              }}
            />
          </label>
          {/* TODO: Expose strip_start, vertical, and serpentine options from PhysicalSegment.Rectangle */}
        </>
      )}
    </>
  );
}
