import React, { createRef, CSSProperties, useContext, useEffect } from 'react';
import { VersatileContainerContext } from '../contexts/VersatileContianer';
import styles from './VersatileElement.module.scss';

const EMULATED_POINTER_EVENT = 'emulatedPointerEvent';

interface VersatileElementProps {
  className?: string;
  id: any;
  style?: CSSProperties;
  element?: any;
  onClick?: () => void;
  onPress?: () => void;
  onDragOver?: (element: any) => void;
  onDragComplete?: () => void;
  children: React.ReactNode;
}

export function VersatileElement({
  className,
  id,
  style,
  element,
  onClick,
  onPress,
  onDragOver,
  onDragComplete,
  children,
}: VersatileElementProps) {
  const elementRef = createRef<HTMLDivElement>();
  const {
    id: activeId,
    activeElement,
    mouseDown,
    state,
    reset,
  } = useContext(VersatileContainerContext);

  useEffect(() => {
    const listener = () => {
      if (onDragOver && state === 'drag' && activeElement != null) {
        onDragOver(activeElement);
      }
    };
    const ref = elementRef.current;
    ref?.addEventListener(EMULATED_POINTER_EVENT, listener);
    return () => ref?.removeEventListener(EMULATED_POINTER_EVENT, listener);
  }, [state, onDragOver, activeElement, element, elementRef]);

  const classes = [styles.element];
  // If there is a long click component add affordances.
  if ((onPress || element) && id === activeId) {
    if (state === 'click') {
      classes.push(styles.click);
    } else if (state === 'press') {
      classes.push(styles.press);
    } else if (state === 'drag') {
      classes.push(styles.drag);
    }
  }
  if (className) {
    classes.push(className);
  }

  return (
    <div
      ref={elementRef}
      className={classes.join(' ')}
      style={style}
      onPointerDown={(e) => {
        if (onClick || onPress) {
          mouseDown(id, element, onDragComplete, e.clientX, e.clientY);
        }
      }}
      onPointerUp={(e) => {
        if (state === 'click' && onClick) {
          onClick();
        } else if (state === 'press') {
          if (onPress) {
            onPress();
          } else if (onClick) {
            onClick();
          }
        }
        reset();
        e.stopPropagation();
      }}
      onPointerMove={(e) => {
        const element = document.elementFromPoint(e.clientX, e.clientY);
        element?.dispatchEvent(
          new Event(EMULATED_POINTER_EVENT, { bubbles: true }),
        );
        e.preventDefault();
      }}
    >
      {children}
    </div>
  );
}
