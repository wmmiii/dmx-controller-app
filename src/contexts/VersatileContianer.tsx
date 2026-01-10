import { createContext, useRef, useState } from 'react';

const PRESS_TIMEOUT_MS = 500;
const DRAG_DISTANCE_PX_SQ = Math.pow(20, 2);

type VersatileState = 'idle' | 'click' | 'press' | 'drag';

export const VersatileContainerContext = createContext({
  activeElement: null as any,
  mouseDown: (
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
    timeout: any;
    onDragComplete: (() => void) | undefined;
    x: number;
    y: number;
  } | null>(null);
  const [activeElement, setActiveElement] = useState(null);

  const reset = () => {
    const onDragComplete = mouseDown.current?.onDragComplete;
    clearTimeout(mouseDown.current?.timeout);
    mouseDown.current = null;
    setState('idle');
    setActiveElement(null);
    if (onDragComplete) {
      onDragComplete();
    }
  };

  const pointerMove = (x: number, y: number) => {
    const pos = mouseDown.current;
    if (pos && state !== 'idle' && state !== 'drag') {
      const dist = Math.pow(x - pos.x, 2) + Math.pow(y - pos.y, 2);
      if (dist > DRAG_DISTANCE_PX_SQ) {
        setState('drag');
      }
    }
  };

  return (
    <div
      className={className}
      onMouseMove={(e) => {
        pointerMove(e.clientX, e.clientY);
      }}
      onTouchMove={(e) => {
        pointerMove(e.touches[0].clientX, e.touches[0].clientY);
      }}
      onMouseLeave={reset}
      onTouchCancel={reset}
    >
      <VersatileContainerContext.Provider
        value={{
          activeElement,
          mouseDown: (element, onDragComplete, x, y) => {
            setActiveElement(element);
            mouseDown.current = {
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
