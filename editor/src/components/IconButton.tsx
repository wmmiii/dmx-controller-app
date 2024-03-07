import React, { JSX } from 'react';

import styles from './IconButton.module.scss';

interface IconButtonProps {
  className?: string;
  onClick: () => void;
  variant?: 'default';
  children: JSX.Element;
}

export function IconButton({className, onClick, variant, children}: IconButtonProps):
    JSX.Element {
  const classes = [styles.button];
  if (className) {
    classes.push(className);
  }

  switch (variant) {
    default:
      classes.push(styles.defaultVariant);
  }

  return (
    <button
      className={classes.join(' ')}
      onClick={onClick}>
      {children}
    </button>
  );
}
