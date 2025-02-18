import { JSX } from 'react';

import styles from './Button.module.scss';

interface BaseButtonProps {
  className?: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'primary' | 'warning';
}

interface ButtonProps extends BaseButtonProps {
  icon?: JSX.Element;
  children: JSX.Element | string;
}

export function Button(
  { className, onClick, disabled, variant, icon, children }: ButtonProps):
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
      onClick={(e) => {
        onClick();
        e.stopPropagation();
        e.preventDefault();
      }}
      disabled={disabled}>
      {icon && <div className={styles.icon}>{icon}</div>}
      {children}
    </button>
  );
}


interface IconButtonProps extends BaseButtonProps {
  title: string;
  children: JSX.Element;
}

export function IconButton(
  { className, onClick, variant, title, children }: IconButtonProps):
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
      title={title}
      className={classes.join(' ')}
      onMouseDown={onClick}>
      {children}
    </button>
  );
}

function classFromVariant(variant: BaseButtonProps['variant']) {
  switch (variant) {
    case 'primary':
      return styles.primaryVariant;
    case 'warning':
      return styles.warningVariant;
    default:
      return styles.defaultVariant;
  }
}
