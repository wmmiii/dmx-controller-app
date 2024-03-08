import React, { JSX } from 'react';

import styles from './Button.module.scss';

interface BaseButtonProps {
  className?: string;
  onClick: () => void;
  variant?: 'default';
}

interface ButtonProps extends BaseButtonProps {
  icon?: JSX.Element;
  children: JSX.Element | string;
}

export function Button(
  { className, onClick, variant, icon, children }: ButtonProps):
  JSX.Element {
  const classes = [
    styles.baseButton,
    styles.button,
    classFromVariant(variant)
  ];
  if (className) {
    classes.push(className);
  }

  return (
    <button
      className={classes.join(' ')}
      onClick={onClick}>
      {icon && <div className={styles.icon}>{icon}</div>}
      {children}
    </button>
  );
}


interface IconButtonProps extends BaseButtonProps {
  children: JSX.Element;
}

export function IconButton(
  { className, onClick, variant, children }: IconButtonProps):
  JSX.Element {
  const classes = [
    styles.baseButton,
    styles.iconButton,
    classFromVariant(variant)
  ];
  if (className) {
    classes.push(className);
  }

  return (
    <button
      className={classes.join(' ')}
      onClick={onClick}>
      {children}
    </button>
  );
}

function classFromVariant(variant: BaseButtonProps['variant']) {
  switch (variant) {
    default:
      return styles.defaultVariant;
  }
}