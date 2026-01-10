import React, { CSSProperties, useContext } from 'react';
import { VersatileContainerContext } from '../contexts/VersatileContianer';
import styles from './VersatileElement.module.scss';

interface VersatileElementProps {
  className: string;
  style: CSSProperties;
  element?: any;
  onClick?: () => void;
  onPress?: () => void;
  onDragOver?: (element: any) => void;
  children: React.ReactNode;
}

export function VersatileElement({
  className,
  style,
  element,
  onClick,
  onPress,
  onDragOver,
  children,
}: VersatileElementProps) {
  const { activeElement, mouseDown, state, reset } = useContext(
    VersatileContainerContext,
  );

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
        if (element) {
          mouseDown(element, e.clientX, e.clientY);
        } else if (onClick) {
          onClick();
        }
      }}
      onMouseUp={() => {
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
      }}
      onMouseMove={() => {
        if (
          onDragOver &&
          state === 'drag' &&
          activeElement != null &&
          activeElement !== element
        ) {
          onDragOver(activeElement);
        }
      }}
    >
      {children}
    </div>
  );
}
