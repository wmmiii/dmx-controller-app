import React, {
  CSSProperties,
  MouseEventHandler,
  TouchEventHandler,
  useContext,
} from 'react';
import { VersatileContainerContext } from '../contexts/VersatileContianer';
import styles from './VersatileElement.module.scss';

interface VersatileElementProps {
  className?: string;
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
  style,
  element,
  onClick,
  onPress,
  onDragOver,
  onDragComplete,
  children,
}: VersatileElementProps) {
  const { activeElement, mouseDown, state, reset } = useContext(
    VersatileContainerContext,
  );

  const pointerDown = (x: number, y: number) => {
    if (element) {
      mouseDown(element, onDragComplete, x, y);
    } else if (onClick) {
      onClick();
    }
  };

  const pointerUp: MouseEventHandler<HTMLDivElement> &
    TouchEventHandler<HTMLDivElement> = (e) => {
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
  };

  const pointerMove: MouseEventHandler<HTMLDivElement> &
    TouchEventHandler<HTMLDivElement> = (e) => {
    if (
      onDragOver &&
      state === 'drag' &&
      activeElement != null &&
      activeElement !== element
    ) {
      onDragOver(activeElement);
      e.stopPropagation();
    }
    e.preventDefault();
  };

  const classes = [styles.element];
  if (element !== null && activeElement === element) {
    if (state === 'click' && onPress) {
      classes.push(styles.click);
    } else if (state === 'press') {
      if (onPress) {
        classes.push(styles.press);
      }
      if (element) {
        classes.push(styles.drag);
      }
    } else if (state === 'drag') {
      classes.push(styles.drag);
    }
  }
  if (className) {
    classes.push(className);
  }

  return (
    <div
      className={classes.join(' ')}
      style={style}
      onMouseDown={(e) => {
        pointerDown(e.clientX, e.clientY);
        e.stopPropagation();
      }}
      onTouchStart={(e) => {
        pointerDown(e.touches[0].clientX, e.touches[0].clientY);
        e.stopPropagation();
        e.preventDefault();
      }}
      onMouseUp={pointerUp}
      onTouchEnd={pointerUp}
      onMouseMove={pointerMove}
      onTouchMove={pointerMove}
    >
      {children}
    </div>
  );
}
