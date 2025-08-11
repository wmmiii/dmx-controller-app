import { JSX } from 'react';

import { SiMidi } from 'react-icons/si';
import styles from './Button.module.scss';

interface BaseButtonProps {
  className?: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'primary' | 'warning';
}

interface ButtonProps extends BaseButtonProps {
  icon?: JSX.Element;
  children: React.ReactNode;
}

export function Button({
  className,
  onClick,
  disabled,
  variant,
  icon,
  children,
}: ButtonProps): JSX.Element {
  const classes = [styles.baseButton, styles.button, classFromVariant(variant)];
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
      disabled={disabled}
    >
      {icon && <div className={styles.icon}>{icon}</div>}
      {children}
    </button>
  );
}

type ControllerButtonProps = Omit<
  Omit<IconButtonProps, 'variant'>,
  'children'
> & {
  midiState: 'inactive' | 'active' | 'mapping';
  iconOnly: boolean;
};

export function ControllerButton(props: ControllerButtonProps) {
  const classes = [styles.baseButton, styles.controllerButton];
  switch (props.midiState) {
    case 'active':
      classes.push(styles.active);
      break;
    case 'inactive':
      classes.push(styles.inactive);
      break;
    case 'mapping':
      classes.push(styles.mapping);
      break;
  }
  if (props.className) {
    classes.push(props.className);
  }

  return (
    <button
      className={classes.join(' ')}
      onClick={(e) => {
        props.onClick();
        e.stopPropagation();
        e.preventDefault();
      }}
      disabled={props.disabled}
    >
      <div className={styles.icon}>
        <SiMidi />
      </div>
      {!props.iconOnly && props.title}
    </button>
  );
}

interface IconButtonProps extends BaseButtonProps {
  title: string;
  iconOnly?: boolean;
  children: JSX.Element;
}

export function IconButton({
  className,
  onClick,
  variant,
  disabled,
  title,
  iconOnly,
  children,
}: IconButtonProps): JSX.Element {
  const classes = [
    styles.baseButton,
    styles.iconButton,
    classFromVariant(variant),
  ];
  if (iconOnly) {
    classes.push(styles.borderless);
  }
  if (className) {
    classes.unshift(className);
  }

  return (
    <button
      title={title}
      className={classes.join(' ')}
      onMouseDown={onClick}
      disabled={disabled}
    >
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
