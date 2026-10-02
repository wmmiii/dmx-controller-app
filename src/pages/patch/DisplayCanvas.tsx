import {
  PhysicalDisplayMapping,
  VirtualDisplay,
} from '@dmx-controller/proto/display_pb';
import clsx from 'clsx';
import { KeyboardEvent, RefObject, useId, useState } from 'react';

import styles from './DisplayEditor.module.css';
import {
  DeviceTransform,
  GraphicalDevice,
  Pixel,
  isOnDisplay,
  placedPixels,
  placedSize,
} from './graphicalDevices';

export interface Placement {
  key: string;
  mapping: PhysicalDisplayMapping;
  device: GraphicalDevice;
}

const MAX_GRID_SIZE = 128;

export function clientToDisplay(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
) {
  const bounds = svg.getBoundingClientRect();
  if (
    clientX < bounds.left ||
    clientX > bounds.right ||
    clientY < bounds.top ||
    clientY > bounds.bottom
  ) {
    return null;
  }
  return new DOMPoint(clientX, clientY).matrixTransform(
    svg.getScreenCTM()!.inverse(),
  );
}

interface DisplayCanvasProps {
  svgRef: RefObject<SVGSVGElement | null>;
  display: VirtualDisplay;
  placements: Placement[];
  ghost: { device: GraphicalDevice; left: number; top: number } | null;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  onMove: (placement: Placement, left: number, top: number) => void;
  onRemove: (placement: Placement) => void;
  isOverRemoveZone: (clientX: number, clientY: number) => boolean;
  onKeyDown: (e: KeyboardEvent<SVGSVGElement>) => void;
}

export function DisplayCanvas({
  svgRef,
  display,
  placements,
  ghost,
  selectedKey,
  onSelect,
  onMove,
  onRemove,
  isOverRemoveZone,
  onKeyDown,
}: DisplayCanvasProps) {
  const gridId = useId();
  const [drag, setDrag] = useState<{
    placement: Placement;
    grabX: number;
    grabY: number;
    left: number;
    top: number;
    removing: boolean;
  } | null>(null);

  // Computed from committed positions so the view doesn't shift mid-drag.
  const bounds = placements.reduce(
    (b, { mapping, device }) => {
      const { width, height } = placedSize(device, mapping.mapping!.rotate);
      return {
        minX: Math.min(b.minX, mapping.mapping!.left),
        minY: Math.min(b.minY, mapping.mapping!.top),
        maxX: Math.max(b.maxX, mapping.mapping!.left + width),
        maxY: Math.max(b.maxY, mapping.mapping!.top + height),
      };
    },
    { minX: 0, minY: 0, maxX: display.width, maxY: display.height },
  );
  const pad = Math.max(
    2,
    Math.ceil(Math.max(display.width, display.height) * 0.15),
  );
  const viewBox = [
    bounds.minX - pad,
    bounds.minY - pad,
    bounds.maxX - bounds.minX + 2 * pad,
    bounds.maxY - bounds.minY + 2 * pad,
  ].join(' ');

  const pointerToDisplay = (e: React.PointerEvent) =>
    new DOMPoint(e.clientX, e.clientY).matrixTransform(
      svgRef.current!.getScreenCTM()!.inverse(),
    );

  return (
    <svg
      ref={svgRef}
      className={styles.canvas}
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={() => onSelect(null)}
      onPointerMove={(e) => {
        if (!drag) {
          return;
        }
        const point = pointerToDisplay(e);
        setDrag({
          ...drag,
          left: Math.round(point.x - drag.grabX),
          top: Math.round(point.y - drag.grabY),
          removing: isOverRemoveZone(e.clientX, e.clientY),
        });
      }}
      onPointerUp={() => {
        if (!drag) {
          return;
        }
        const mapping = drag.placement.mapping.mapping!;
        if (drag.removing) {
          onRemove(drag.placement);
        } else if (drag.left !== mapping.left || drag.top !== mapping.top) {
          onMove(drag.placement, drag.left, drag.top);
        }
        setDrag(null);
      }}
      onPointerCancel={() => setDrag(null)}
    >
      <defs>
        <pattern
          id={gridId}
          width={1}
          height={1}
          patternUnits="userSpaceOnUse"
        >
          <path className={styles.gridLine} d="M1 0H0V1" />
        </pattern>
      </defs>
      <rect
        className={styles.displayArea}
        width={display.width}
        height={display.height}
      />
      {Math.max(display.width, display.height) <= MAX_GRID_SIZE && (
        <rect
          width={display.width}
          height={display.height}
          fill={`url(#${CSS.escape(gridId)})`}
          pointerEvents="none"
        />
      )}
      {placements.map((placement) => {
        const dragging = drag?.placement.key === placement.key;
        const mapping = dragging
          ? { ...placement.mapping.mapping!, left: drag.left, top: drag.top }
          : placement.mapping.mapping!;
        return (
          <DevicePixels
            key={placement.key}
            className={clsx({
              [styles.selected]: placement.key === selectedKey,
              [styles.removing]: dragging && drag.removing,
            })}
            device={placement.device}
            mapping={mapping}
            display={display}
            onPointerDown={(e) => {
              e.stopPropagation();
              svgRef.current!.setPointerCapture(e.pointerId);
              svgRef.current!.focus();
              const point = pointerToDisplay(e);
              onSelect(placement.key);
              setDrag({
                placement,
                grabX: point.x - mapping.left,
                grabY: point.y - mapping.top,
                left: mapping.left,
                top: mapping.top,
                removing: false,
              });
            }}
          />
        );
      })}
      {ghost && (
        <DevicePixels
          className={styles.ghost}
          device={ghost.device}
          mapping={{
            left: ghost.left,
            top: ghost.top,
            rotate: 0,
            flipHorizontally: false,
            flipVertically: false,
          }}
          display={display}
        />
      )}
      <rect
        className={styles.displayBorder}
        width={display.width}
        height={display.height}
      />
    </svg>
  );
}

interface DevicePixelsProps {
  className?: string;
  device: GraphicalDevice;
  mapping: DeviceTransform;
  display: VirtualDisplay;
  onPointerDown?: (e: React.PointerEvent) => void;
}

function DevicePixels({
  className,
  device,
  mapping,
  display,
  onPointerDown,
}: DevicePixelsProps) {
  const pixels = placedPixels(device, mapping);
  const toPath = (p: Pixel[]) =>
    p.map(([x, y]) => `M${x} ${y}h1v1h-1z`).join('');
  const { width, height } = placedSize(device, mapping.rotate);

  return (
    <g
      className={clsx(styles.device, className)}
      onPointerDown={onPointerDown}
    >
      <title>{device.label}</title>
      <rect
        className={styles.deviceBounds}
        x={mapping.left}
        y={mapping.top}
        width={width}
        height={height}
      />
      <path
        className={styles.devicePixels}
        d={toPath(pixels.filter((p) => isOnDisplay(p, display)))}
      />
      <path
        className={styles.hangingPixels}
        d={toPath(pixels.filter((p) => !isOnDisplay(p, display)))}
      />
      {pixels.length > 1 && (
        <path
          className={styles.wiringStart}
          d={`M${pixels[0][0] + 0.5} ${pixels[0][1] + 0.5}L${pixels[1][0] + 0.5} ${pixels[1][1] + 0.5}`}
        />
      )}
      {pixels.length > 0 && (
        <circle
          className={styles.wiringStart}
          cx={pixels[0][0] + 0.5}
          cy={pixels[0][1] + 0.5}
          r={0.25}
        />
      )}
    </g>
  );
}
