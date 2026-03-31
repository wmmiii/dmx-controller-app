import { createContext, MutableRefObject, useEffect, useRef, useState } from 'react';
import styles from './VersatileContainer.module.css';

const PRESS_TIMEOUT_MS = 500;
const DRAG_DISTANCE_PX_SQ = Math.pow(20, 2);

type VersatileState = 'idle' | 'click' | 'press' | 'drag';

const idleRef: MutableRefObject<VersatileState> = { current: 'idle' };

export const VersatileContainerContext = createContext({
  id: null as unknown,
  activeElement: null as unknown,
  mouseDown: (
    _id: unknown,
    _element: unknown,
    _onDragComplete: (() => void) | undefined,
    _x: number,
    _y: number,
  ) => {},
  state: 'idle' as VersatileState,
  stateRef: idleRef as MutableRefObject<VersatileState>,
  reset: () => {},
});

interface DragAndDropProviderProps {
  className: string;
  children: React.ReactNode;
}

export function VersatileContainer({
  className,
  children,
}: DragAndDropProviderProps) {
  const [state, setState] = useState<VersatileState>('idle');
  const mouseDown = useRef<{
    id: unknown;
    timeout: number | undefined;
    onDragComplete: (() => void) | undefined;
    x: number;
    y: number;
  } | null>(null);
  const [activeElement, setActiveElement] = useState<unknown>(null);

  useEffect(() => {
    if (state === 'press' || state === 'drag') {
      const root = document.body;
      root.classList.add(styles.suppressTouch);
      return () => root.classList.remove(styles.suppressTouch);
    }
    return () => {};
  }, [state]);

  const reset = () => {
    setState((state) => {
      if (state === 'drag' && mouseDown.current?.onDragComplete) {
        mouseDown.current.onDragComplete();
      }
      return 'idle';
    });
    clearTimeout(mouseDown.current?.timeout);
    mouseDown.current = null;
    setActiveElement(null);
  };

  const classes = [];
  if (state === 'press' || state === 'drag') {
    classes.push(styles.suppressTouch);
  }
  if (className) {
    classes.push(className);
  }

  return (
    <div
      className={classes.join(' ')}
      onPointerMove={(e) => {
        const pos = mouseDown.current;
        if (pos && state === 'press') {
          const dist =
            Math.pow(e.clientX - pos.x, 2) + Math.pow(e.clientY - pos.y, 2);
          if (dist > DRAG_DISTANCE_PX_SQ) {
            setState('drag');
          }
        }
      }}
      onPointerLeave={reset}
    >
      <VersatileContainerContext.Provider
        value={{
          id: mouseDown.current?.id,
          activeElement,
          mouseDown: (id, element, onDragComplete, x, y) => {
            setActiveElement(element);
            mouseDown.current = {
              id,
              timeout: setTimeout(() => {
                setState('press');
              }, PRESS_TIMEOUT_MS),
              onDragComplete,
              x,
              y,
            };
            setState('click');
          },
          state,
          reset,
        }}
      >
        {children}
      </VersatileContainerContext.Provider>
    </div>
  );
}
