import { create } from '@bufbuild/protobuf';
import { DdpOutput } from '@dmx-controller/proto/ddp_pb';
import {
  PhysicalDisplayMapping,
  PhysicalDisplayMappingSchema,
  VirtualDisplay,
  VirtualDisplaySchema,
  VirtualMappingSchema,
} from '@dmx-controller/proto/display_pb';
import { PhysicalSegment } from '@dmx-controller/proto/pixel_mapping_pb';
import { useCallback, useContext, useMemo } from 'react';
import { BiError, BiPlus, BiTrash } from 'react-icons/bi';
import {
  Link,
  Navigate,
  Outlet,
  Route,
  useNavigate,
  useParams,
} from 'react-router';

import { Browser } from '../../components/Browser';
import { Button, IconButton } from '../../components/Button';
import { NumberInput } from '../../components/Input';
import { Select } from '../../components/Select';
import { Toggle } from '../../components/Toggle';
import { ProjectContext } from '../../contexts/ProjectContext';
import { randomUint64 } from '../../util/numberUtils';
import { getActivePatch } from '../../util/projectUtils';
import styles from './DisplayEditor.module.css';

export const displaysRoutes = (
  <Route path="displays" element={<DisplayEditor />}>
    <Route path=":displayId" element={<DisplayDetail />} />
  </Route>
);

function DisplayEditor() {
  const { project, save } = useContext(ProjectContext);
  const navigate = useNavigate();
  const { displayId } = useParams();

  return (
    <Browser
      className={styles.displayContents}
      items={Object.entries(project.displays).map(([id, display]) => ({
        name: display.name,
        setName: (name) => {
          display.name = name;
          save(`Set display name to "${name}".`);
        },
        selected: id === displayId,
        onSelect: () => navigate(`/patch/displays/${id}`),
        dim: !display.enabled,
      }))}
      listHeader={
        <Button
          icon={<BiPlus size={18} />}
          onClick={() => {
            const newId = randomUint64();
            project.displays[newId.toString()] = create(VirtualDisplaySchema, {
              name: 'New Display',
              width: 64,
              height: 64,
              enabled: true,
            });
            save('Create new virtual display.');
            navigate(`/patch/displays/${newId}`);
          }}
        >
          Add New Display
        </Button>
      }
      emptyPlaceholder={
        <>
          <p>Select a display to edit.</p>
          <p>
            A display is a single image onto which visuals are drawn. Physical
            devices (such as WLED fixtures using the DDP protocol) each render
            some or all of that image.
          </p>
          <p>
            This lets you combine several devices into one display, so separate
            fixtures can act as one continuous picture.
          </p>
          <p>
            To draw onto a display, create a{' '}
            <Link to="/patch/visualizers">visualizer</Link>.
          </p>
        </>
      }
    >
      {displayId != null ? <Outlet /> : undefined}
    </Browser>
  );
}

function DisplayDetail() {
  const { project } = useContext(ProjectContext);
  const navigate = useNavigate();
  const { displayId } = useParams();

  const display = displayId != null ? project.displays[displayId] : undefined;
  if (displayId == null || display == null) {
    return <Navigate to="/patch/displays" replace />;
  }

  return (
    <DisplayEditorPane
      display={display}
      displayId={BigInt(displayId)}
      clearDisplay={() => navigate('/patch/displays')}
    />
  );
}

interface DisplayEditorPaneProps {
  displayId: bigint;
  display: VirtualDisplay;
  clearDisplay: () => void;
}

function DisplayEditorPane({
  displayId,
  display,
  clearDisplay,
}: DisplayEditorPaneProps) {
  const { project, save } = useContext(ProjectContext);

  return (
    <div className={styles.displayEditor}>
      <div className={styles.header}>
        <Button
          icon={<BiTrash />}
          variant="warning"
          onClick={() => {
            delete project.displays[displayId!.toString()];
            save(`Deleted display "${display.name}".`);
            clearDisplay();
          }}
        >
          Delete {display.name}
        </Button>
      </div>
      <div className={styles.settings}>
        <label>
          <span>Enabled</span>
          <Toggle
            className={styles.enabledToggle}
            value={display.enabled}
            onChange={(enabled) => {
              display.enabled = enabled;
              save(
                `${enabled ? 'Enabled' : 'Disabled'} display "${display.name}".`,
              );
            }}
          />
        </label>
        <label>
          <span>Width</span>
          <NumberInput
            mode="integer"
            value={display.width}
            onFinalize={(width) => {
              display.width = width;
              save(`Set display width to ${width}.`);
            }}
          />
        </label>
        <label>
          <span>Height</span>
          <NumberInput
            mode="integer"
            value={display.height}
            onFinalize={(height) => {
              display.height = height;
              save(`Set display height to ${height}.`);
            }}
          />
        </label>
      </div>
      <div className={styles.segments}>
        <h3>Segments</h3>
        <SegmentList display={display} />
        <AddSegmentDropdown display={display} />
      </div>
    </div>
  );
}

interface SegmentListProps {
  display: VirtualDisplay;
}

function getSegmentDimensions(segment: PhysicalSegment): {
  width: number;
  height: number;
} {
  switch (segment.shape.case) {
    case 'line':
      return { width: segment.shape.value.length, height: 1 };
    case 'rectangle':
      return {
        width: segment.shape.value.width,
        height: segment.shape.value.height,
      };
    default:
      return { width: 0, height: 0 };
  }
}

function SegmentList({ display }: SegmentListProps) {
  const { project, save } = useContext(ProjectContext);

  const activePatch = getActivePatch(project);

  const getSegmentInfo = useCallback(
    (
      mapping: PhysicalDisplayMapping,
    ): { label: string; width: number; height: number } => {
      const output = activePatch.outputs[mapping.output.toString()];
      if (!output) {
        throw new Error(
          `Display mapping references unknown output ${mapping.output}`,
        );
      }
      if (output.output.case !== 'ddpOutput') {
        throw new Error(
          `Display mapping references non-DDP output ${mapping.output}`,
        );
      }
      const ddpOutput = output.output.value as DdpOutput;
      const segment = ddpOutput.segments[Number(mapping.segment)];
      if (!segment) {
        throw new Error(
          `Display mapping references unknown segment ${mapping.segment}`,
        );
      }
      const { width, height } = getSegmentDimensions(segment);
      return {
        label: `${output.name} / Segment ${Number(mapping.segment) + 1}`,
        width,
        height,
      };
    },
    [activePatch],
  );

  if (display.mappings.length === 0) {
    return <p className={styles.noSegments}>No segments added yet.</p>;
  }

  return (
    <ul className={styles.segmentList}>
      {display.mappings
        .filter((m) => m.patch === project.activePatch)
        .map((mapping, index) => {
          const { label, width, height } = getSegmentInfo(mapping);
          const left = mapping.mapping!.left;
          const top = mapping.mapping!.top;
          const outOfBounds =
            left + width > display.width || top + height > display.height;

          return (
            <li key={index} className={styles.segmentItem}>
              <div className={styles.segmentHeader}>
                <span className={styles.segmentName}>{label}</span>
                <IconButton
                  title={`Delete segment ${index + 1}`}
                  variant="warning"
                  onClick={() => {
                    display.mappings.splice(index, 1);
                    save(`Removed segment from display "${display.name}".`);
                  }}
                >
                  <BiTrash />
                </IconButton>
              </div>
              {outOfBounds && (
                <div className={styles.segmentWarning}>
                  <BiError />
                  <span>
                    Segment extends beyond display bounds ({width}x{height} at{' '}
                    {left},{top})
                  </span>
                </div>
              )}
              <div className={styles.segmentCoords}>
                <label>
                  <span>Left</span>
                  <NumberInput
                    mode="integer"
                    value={left}
                    onFinalize={(newLeft) => {
                      mapping.mapping!.left = newLeft;
                      save(`Set segment left to ${newLeft}.`);
                    }}
                  />
                </label>
                <label>
                  <span>Top</span>
                  <NumberInput
                    mode="integer"
                    value={top}
                    onFinalize={(newTop) => {
                      mapping.mapping!.top = newTop;
                      save(`Set segment top to ${newTop}.`);
                    }}
                  />
                </label>
              </div>
            </li>
          );
        })}
    </ul>
  );
}

interface AddSegmentDropdownProps {
  display: VirtualDisplay;
}

function AddSegmentDropdown({ display }: AddSegmentDropdownProps) {
  const { project, save } = useContext(ProjectContext);

  const activePatch = getActivePatch(project);

  const availableSegments = useMemo(
    () =>
      Object.entries(activePatch.outputs)
        .map(([idStr, output]) => [BigInt(idStr), output] as const)
        .flatMap(([outputId, output]) => {
          if (output.output.case !== 'ddpOutput') {
            return [];
          }

          return output.output.value.segments.map((_s, i) => ({
            outputId,
            outputName: output.name,
            segmentIndex: i,
          }));
        })
        .filter(
          (seg) =>
            !display.mappings.some(
              (m) =>
                m.patch === project.activePatch &&
                m.output === seg.outputId &&
                Number(m.segment) === seg.segmentIndex,
            ),
        ),
    [activePatch, display.mappings, project.activePatch],
  );

  const handleAdd = useCallback(
    (value: string) => {
      if (!value) {
        return;
      }

      const [outputId, segmentIndex] = value.split(':');
      const mapping = create(PhysicalDisplayMappingSchema, {
        patch: project.activePatch,
        output: BigInt(outputId),
        segment: BigInt(segmentIndex),
        mapping: create(VirtualMappingSchema, {
          left: 0,
          top: 0,
        }),
      });

      display.mappings.push(mapping);
      save(`Added segment to display "${display.name}".`);
    },
    [display, save, project.activePatch],
  );

  if (availableSegments.length === 0) {
    return (
      <p className={styles.noSegments}>
        No DDP segments available. Add DDP outputs with segments first.
      </p>
    );
  }

  return (
    <Select
      value=""
      onChange={handleAdd}
      placeholder="Add a segment..."
      options={[
        { value: '', label: 'Add a segment...', disabled: true },
        ...availableSegments.map((seg) => ({
          value: `${seg.outputId}:${seg.segmentIndex}`,
          label: `${seg.outputName} / Segment ${seg.segmentIndex + 1}`,
        })),
      ]}
    />
  );
}
