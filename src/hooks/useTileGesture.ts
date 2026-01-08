import { useCallback, useEffect, useRef, useState } from 'react';

// Timing constants
const LONG_PRESS_DURATION = 500; // milliseconds
const DOUBLE_CLICK_WINDOW = 300; // milliseconds
const DRAG_THRESHOLD = 5; // pixels

type GestureState =
  | 'IDLE'
  | 'PENDING_CLICK'
  | 'DRAGGING'
  | 'LONG_PRESSING'
  | 'WAITING_DOUBLE_CLICK';

interface Position {
  x: number;
  y: number;
}

interface TileGestureCallbacks {
  onToggle: () => void;
  onEdit: () => void;
  onDragStart: () => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: () => void;
}

interface TileGestureHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  isDragging: boolean;
}

export function useTileGesture(
  callbacks: TileGestureCallbacks,
): TileGestureHandlers {
  const [gestureState, setGestureState] = useState<GestureState>('IDLE');
  const [isDragging, setIsDragging] = useState(false);

  const startPosRef = useRef<Position | null>(null);
  const currentPosRef = useRef<Position | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const doubleClickTimerRef = useRef<number | null>(null);
  const pointerIdRef = useRef<number | null>(null);

  // Clear timers helper
  const clearTimers = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (doubleClickTimerRef.current !== null) {
      window.clearTimeout(doubleClickTimerRef.current);
      doubleClickTimerRef.current = null;
    }
  }, []);

  // Calculate distance between two points
  const getDistance = useCallback((pos1: Position, pos2: Position): number => {
    return Math.sqrt(
      Math.pow(pos2.x - pos1.x, 2) + Math.pow(pos2.y - pos1.y, 2),
    );
  }, []);

  // Reset to idle state
  const resetState = useCallback(() => {
    clearTimers();
    setGestureState('IDLE');
    setIsDragging(false);
    startPosRef.current = null;
    currentPosRef.current = null;
    pointerIdRef.current = null;
  }, [clearTimers]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only handle primary pointer
      if (!e.isPrimary) return;

      // Capture the pointer
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      pointerIdRef.current = e.pointerId;

      const pos: Position = { x: e.clientX, y: e.clientY };
      startPosRef.current = pos;
      currentPosRef.current = pos;

      // If we're waiting for a double-click and another click comes
      if (gestureState === 'WAITING_DOUBLE_CLICK') {
        clearTimers();
        setGestureState('IDLE');
        callbacks.onEdit();
        return;
      }

      // Start new gesture
      setGestureState('PENDING_CLICK');

      // Start long-press timer
      longPressTimerRef.current = window.setTimeout(() => {
        setGestureState('LONG_PRESSING');
        longPressTimerRef.current = null;
      }, LONG_PRESS_DURATION);
    },
    [gestureState, callbacks, clearTimers],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!e.isPrimary || pointerIdRef.current !== e.pointerId) return;
      if (!startPosRef.current) return;

      const currentPos: Position = { x: e.clientX, y: e.clientY };
      currentPosRef.current = currentPos;

      const distance = getDistance(startPosRef.current, currentPos);

      // Check if movement exceeds threshold
      if (distance > DRAG_THRESHOLD) {
        if (gestureState === 'PENDING_CLICK') {
          // Cancel click, start drag
          clearTimers();
          setGestureState('DRAGGING');
          setIsDragging(true);
          callbacks.onDragStart();
          e.preventDefault(); // Prevent scrolling on touch devices
        } else if (gestureState === 'LONG_PRESSING') {
          // Long press then drag
          setGestureState('DRAGGING');
          setIsDragging(true);
          callbacks.onDragStart();
          e.preventDefault();
        }
      }

      // If we're dragging, update position
      if (gestureState === 'DRAGGING') {
        callbacks.onDragMove(currentPos.x, currentPos.y);
        e.preventDefault();
      }
    },
    [gestureState, callbacks, getDistance, clearTimers],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!e.isPrimary || pointerIdRef.current !== e.pointerId) return;

      // Release pointer capture
      if (e.target && (e.target as HTMLElement).releasePointerCapture) {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      }

      const currentState = gestureState;

      if (currentState === 'PENDING_CLICK') {
        // Click detected, wait for potential double-click
        clearTimers();
        setGestureState('WAITING_DOUBLE_CLICK');

        doubleClickTimerRef.current = window.setTimeout(() => {
          setGestureState('IDLE');
          callbacks.onToggle();
          doubleClickTimerRef.current = null;
        }, DOUBLE_CLICK_WINDOW);
      } else if (currentState === 'LONG_PRESSING') {
        // Long press without drag - open edit
        resetState();
        callbacks.onEdit();
      } else if (currentState === 'DRAGGING') {
        // End drag
        resetState();
        callbacks.onDragEnd();
      } else if (currentState === 'WAITING_DOUBLE_CLICK') {
        // This shouldn't happen, but handle it
        resetState();
      } else {
        // IDLE or unknown state
        resetState();
      }
    },
    [gestureState, callbacks, clearTimers, resetState],
  );

  const onPointerCancel = useCallback(
    (e: React.PointerEvent) => {
      if (!e.isPrimary || pointerIdRef.current !== e.pointerId) return;

      // Release pointer capture if possible
      if (e.target && (e.target as HTMLElement).releasePointerCapture) {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      }

      resetState();
    },
    [resetState],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    isDragging,
  };
}
