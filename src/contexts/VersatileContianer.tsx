import { createContext, useEffect, useRef, useState } from 'react';
import styles from './VersatileContainer.module.scss';

const PRESS_TIMEOUT_MS = 500;
const DRAG_DISTANCE_PX_SQ = Math.pow(20, 2);

type VersatileState = 'idle' | 'click' | 'press' | 'drag';

export const VersatileContainerContext = createContext({
  id: null as any,
  activeElement: null as any,
  mouseDown: (
    _id: any,
    _element: any,
    _onDragComplete: (() => void) | undefined,
    _x: number,
    _y: number,
  ) => {},
  state: 'idle' as VersatileState,
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
    id: any;
    timeout: any;
    onDragComplete: (() => void) | undefined;
    x: number;
    y: number;
  } | null>(null);
  const [activeElement, setActiveElement] = useState(null);

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
