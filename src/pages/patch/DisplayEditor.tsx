import { create } from '@bufbuild/protobuf';
import {
  PhysicalDisplayMapping,
  PhysicalDisplayMappingSchema,
  VirtualDisplay,
  VirtualDisplaySchema,
  VirtualMappingSchema,
  VirtualMapping_Rotate,
} from '@dmx-controller/proto/display_pb';
import clsx from 'clsx';
import { KeyboardEvent, useContext, useRef, useState } from 'react';
import {
  BiError,
  BiPlus,
  BiReflectHorizontal,
  BiReflectVertical,
  BiRotateLeft,
  BiRotateRight,
  BiTrash,
} from 'react-icons/bi';
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
import { Toggle } from '../../components/Toggle';
import { ProjectContext } from '../../contexts/ProjectContext';
import { randomUint64 } from '../../util/numberUtils';
import { getActivePatch } from '../../util/projectUtils';
import { DisplayCanvas, Placement, clientToDisplay } from './DisplayCanvas';
import styles from './DisplayEditor.module.css';
import {
  GraphicalDevice,
  deviceKey,
  isOnDisplay,
  isQuarterTurn,
  listGraphicalDevices,
  placedPixels,
  placedSize,
} from './graphicalDevices';

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
      key={displayId}
      display={display}
      displayId={displayId}
      clearDisplay={() => navigate('/patch/displays')}
    />
  );
}

interface DisplayEditorPaneProps {
  displayId: string;
  display: VirtualDisplay;
  clearDisplay: () => void;
}

function DisplayEditorPane({
  displayId,
  display,
  clearDisplay,
}: DisplayEditorPaneProps) {
  const { project, save } = useContext(ProjectContext);
  const canvasRef = useRef<SVGSVGElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<{
    device: GraphicalDevice;
    startX: number;
    startY: number;
    clientX: number;
    clientY: number;
    position: { left: number; top: number } | null;
  } | null>(null);

  const devices = listGraphicalDevices(getActivePatch(project));
  const devicesByKey = new Map(devices.map((d) => [d.key, d]));
  const mappingsInPatch = display.mappings.filter(
    (m) => m.patch === project.activePatch,
  );
  const placements: Placement[] = mappingsInPatch.flatMap((mapping) => {
    const key = deviceKey(mapping.output, mapping.segment);
    const device = devicesByKey.get(key);
    return device ? [{ key, mapping, device }] : [];
  });
  const missingMappings = mappingsInPatch.filter(
    (m) => !devicesByKey.has(deviceKey(m.output, m.segment)),
  );
  const placedKeys = new Set(placements.map((p) => p.key));
  const unplacedDevices = devices.filter((d) => !placedKeys.has(d.key));
  const selected = placements.find((p) => p.key === selectedKey);

  const hangingPixelCount = ({ device, mapping }: Placement) =>
    placedPixels(device, mapping.mapping!).filter(
      (p) => !isOnDisplay(p, display),
    ).length;

  const otherDisplayNames = (key: string) =>
    Object.entries(project.displays)
      .filter(
        ([id, d]) =>
          id !== displayId &&
          d.mappings.some(
            (m) =>
              m.patch === project.activePatch &&
              deviceKey(m.output, m.segment) === key,
          ),
      )
      .map(([, d]) => d.name);

  const positionOnCanvas = (
    device: GraphicalDevice,
    clientX: number,
    clientY: number,
  ) => {
    const point = clientToDisplay(canvasRef.current!, clientX, clientY);
    return point
      ? {
          left: Math.round(point.x - device.width / 2),
          top: Math.round(point.y - device.height / 2),
        }
      : null;
  };

  const place = (device: GraphicalDevice, left: number, top: number) => {
    display.mappings.push(
      create(PhysicalDisplayMappingSchema, {
        patch: project.activePatch,
        output: device.output,
        segment: device.segment,
        mapping: create(VirtualMappingSchema, { left, top }),
      }),
    );
    setSelectedKey(device.key);
    save(`Placed ${device.label} on display "${display.name}".`);
  };

  const remove = (mapping: PhysicalDisplayMapping, label: string) => {
    display.mappings.splice(display.mappings.indexOf(mapping), 1);
    setSelectedKey(null);
    save(`Removed ${label} from display "${display.name}".`);
  };

  const move = ({ mapping, device }: Placement, left: number, top: number) => {
    mapping.mapping!.left = left;
    mapping.mapping!.top = top;
    save(`Moved ${device.label} to ${left}, ${top}.`);
  };

  // Rotates about the device's center rather than its top-left corner.
  const rotate = ({ mapping, device }: Placement, clockwise: boolean) => {
    const transform = mapping.mapping!;
    const { width, height } = placedSize(device, transform.rotate);
    const shift = Math.trunc((width - height) / 2);
    transform.left += shift;
    transform.top -= shift;
    transform.rotate = ((transform.rotate + (clockwise ? 1 : 3)) %
      4) as VirtualMapping_Rotate;
    save(`Rotated ${device.label} ${clockwise ? 'clockwise' : 'counter-clockwise'}.`);
  };

  // Flips are stored in device space, so a quarter turn swaps which stored
  // axis appears horizontal on screen.
  const isFlipped = ({ mapping }: Placement, horizontal: boolean) => {
    const transform = mapping.mapping!;
    return horizontal !== isQuarterTurn(transform.rotate)
      ? transform.flipHorizontally
      : transform.flipVertically;
  };
  const flip = ({ mapping, device }: Placement, horizontal: boolean) => {
    const transform = mapping.mapping!;
    if (horizontal !== isQuarterTurn(transform.rotate)) {
      transform.flipHorizontally = !transform.flipHorizontally;
    } else {
      transform.flipVertically = !transform.flipVertically;
    }
    save(`Flipped ${device.label} ${horizontal ? 'horizontally' : 'vertically'}.`);
  };

  const onCanvasKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!selected) {
      return;
    }
    const step = e.shiftKey ? 10 : 1;
    const { left, top } = selected.mapping.mapping!;
    switch (e.key) {
      case 'ArrowLeft':
        move(selected, left - step, top);
        break;
      case 'ArrowRight':
        move(selected, left + step, top);
        break;
      case 'ArrowUp':
        move(selected, left, top - step);
        break;
      case 'ArrowDown':
        move(selected, left, top + step);
        break;
      case 'r':
      case 'R':
        rotate(selected, !e.shiftKey);
        break;
      case 'Delete':
      case 'Backspace':
        remove(selected.mapping, selected.device.label);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const isOverSidebar = (clientX: number, clientY: number) => {
    const bounds = sidebarRef.current!.getBoundingClientRect();
    return (
      clientX >= bounds.left &&
      clientX <= bounds.right &&
      clientY >= bounds.top &&
      clientY <= bounds.bottom
    );
  };

  return (
    <div className={styles.displayEditor}>
      <div className={styles.header}>
        <label>
          <span>Enabled</span>
          <Toggle
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
        <Button
          className={styles.deleteDisplay}
          icon={<BiTrash />}
          variant="warning"
          onClick={() => {
            delete project.displays[displayId];
            save(`Deleted display "${display.name}".`);
            clearDisplay();
          }}
        >
          Delete {display.name}
        </Button>
      </div>
      <div className={styles.workspace}>
        <div ref={sidebarRef} className={styles.sidebar}>
          <h3>Unplaced</h3>
          {devices.length === 0 ? (
            <p className={styles.empty}>
              No graphical devices. Add a DDP output with segments first.
            </p>
          ) : unplacedDevices.length === 0 ? (
            <p className={styles.empty}>Every device is on this display.</p>
          ) : (
            <ul className={styles.deviceList}>
              {unplacedDevices.map((device) => {
                const others = otherDisplayNames(device.key);
                return (
                  <li
                    key={device.key}
                    className={clsx(styles.deviceItem, styles.draggable)}
                    title="Drag onto the display, or click to place at the top-left."
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.currentTarget.setPointerCapture(e.pointerId);
                      setIncoming({
                        device,
                        startX: e.clientX,
                        startY: e.clientY,
                        clientX: e.clientX,
                        clientY: e.clientY,
                        position: null,
                      });
                    }}
                    onPointerMove={(e) => {
                      if (incoming?.device.key !== device.key) {
                        return;
                      }
                      setIncoming({
                        ...incoming,
                        clientX: e.clientX,
                        clientY: e.clientY,
                        position: positionOnCanvas(
                          device,
                          e.clientX,
                          e.clientY,
                        ),
                      });
                    }}
                    onPointerUp={(e) => {
                      if (incoming?.device.key !== device.key) {
                        return;
                      }
                      const clicked =
                        Math.hypot(
                          e.clientX - incoming.startX,
                          e.clientY - incoming.startY,
                        ) < 3;
                      const position = clicked
                        ? { left: 0, top: 0 }
                        : positionOnCanvas(device, e.clientX, e.clientY);
                      if (position) {
                        place(device, position.left, position.top);
                      }
                      setIncoming(null);
                    }}
                    onPointerCancel={() => setIncoming(null)}
                  >
                    <span className={styles.deviceName}>{device.label}</span>
                    <span className={styles.deviceMeta}>
                      {device.width}×{device.height}
                      {others.length > 0 && (
                        <span title={`Also on ${others.join(', ')}`}>
                          {' '}
                          · on {others.length} other display
                          {others.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <h3>On this display</h3>
          {placements.length === 0 && missingMappings.length === 0 ? (
            <p className={styles.empty}>Drag devices onto the display.</p>
          ) : (
            <ul className={styles.deviceList}>
              {placements.map((placement) => (
                <li
                  key={placement.key}
                  className={clsx(styles.deviceItem, {
                    [styles.selected]: placement.key === selectedKey,
                  })}
                  onClick={() => {
                    setSelectedKey(placement.key);
                    canvasRef.current?.focus();
                  }}
                >
                  <span className={styles.deviceName}>
                    {placement.device.label}
                  </span>
                  {hangingPixelCount(placement) > 0 && (
                    <BiError
                      className={styles.hangingIcon}
                      title="Pixels hang off the display"
                    />
                  )}
                </li>
              ))}
              {missingMappings.map((mapping) => (
                <li
                  key={deviceKey(mapping.output, mapping.segment)}
                  className={styles.deviceItem}
                >
                  <span className={styles.deviceName}>
                    Missing device (segment {Number(mapping.segment) + 1})
                  </span>
                  <IconButton
                    title="Remove missing device"
                    variant="warning"
                    onClick={() => remove(mapping, 'missing device')}
                  >
                    <BiTrash />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={styles.canvasContainer}>
          <DisplayCanvas
            svgRef={canvasRef}
            display={display}
            placements={placements}
            ghost={
              incoming?.position
                ? { device: incoming.device, ...incoming.position }
                : null
            }
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
            onMove={move}
            onRemove={(p) => remove(p.mapping, p.device.label)}
            isOverRemoveZone={isOverSidebar}
            onKeyDown={onCanvasKeyDown}
          />
          {selected && (
            <div className={styles.inspector}>
              <div className={styles.inspectorTitle}>
                {selected.device.label}
              </div>
              <div className={styles.inspectorRow}>
                <label>
                  <span>Left</span>
                  <NumberInput
                    mode="integer"
                    value={selected.mapping.mapping!.left}
                    onFinalize={(left) =>
                      move(selected, left, selected.mapping.mapping!.top)
                    }
                  />
                </label>
                <label>
                  <span>Top</span>
                  <NumberInput
                    mode="integer"
                    value={selected.mapping.mapping!.top}
                    onFinalize={(top) =>
                      move(selected, selected.mapping.mapping!.left, top)
                    }
                  />
                </label>
              </div>
              <div className={styles.inspectorRow}>
                <IconButton
                  title="Rotate counter-clockwise (Shift+R)"
                  onClick={() => rotate(selected, false)}
                >
                  <BiRotateLeft />
                </IconButton>
                <IconButton
                  title="Rotate clockwise (R)"
                  onClick={() => rotate(selected, true)}
                >
                  <BiRotateRight />
                </IconButton>
                <IconButton
                  title="Flip horizontally"
                  variant={isFlipped(selected, true) ? 'primary' : 'default'}
                  onClick={() => flip(selected, true)}
                >
                  <BiReflectVertical />
                </IconButton>
                <IconButton
                  title="Flip vertically"
                  variant={isFlipped(selected, false) ? 'primary' : 'default'}
                  onClick={() => flip(selected, false)}
                >
                  <BiReflectHorizontal />
                </IconButton>
                <IconButton
                  title="Remove from display (Delete)"
                  variant="warning"
                  onClick={() =>
                    remove(selected.mapping, selected.device.label)
                  }
                >
                  <BiTrash />
                </IconButton>
              </div>
              {hangingPixelCount(selected) > 0 && (
                <div className={styles.warning}>
                  <BiError />
                  {hangingPixelCount(selected)} pixels hang off the display.
                </div>
              )}
              {otherDisplayNames(selected.key).length > 0 && (
                <div className={styles.inspectorNote}>
                  Also on {otherDisplayNames(selected.key).join(', ')}.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {incoming && !incoming.position && (
        <div
          className={styles.dragLabel}
          style={{ left: incoming.clientX, top: incoming.clientY }}
        >
          {incoming.device.label}
        </div>
      )}
    </div>
  );
}
