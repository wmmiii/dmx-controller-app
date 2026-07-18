import { JSX } from 'react';
import { SiMidi } from 'react-icons/si';

import clsx from 'clsx';
import styles from './Button.module.css';

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
  return (
    <button
      className={clsx(
        styles.baseButton,
        styles.button,
        classFromVariant(variant),
        className,
      )}
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
  iconOnly?: boolean;
};

export function ControllerButton(props: ControllerButtonProps) {
  return (
    <button
      className={clsx(
        styles.baseButton,
        styles.controllerButton,
        {
          [styles.active]: props.midiState === 'active',
          [styles.inactive]: props.midiState === 'inactive',
          [styles.mapping]: props.midiState === 'mapping',
        },
        props.className,
      )}
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
  children: JSX.Element;
}

export function IconButton({
  className,
  onClick,
  variant,
  disabled,
  title,
  children,
}: IconButtonProps): JSX.Element {
  return (
    <button
      title={title}
      className={clsx(
        styles.baseButton,
        styles.iconButton,
        classFromVariant(variant),
        className,
      )}
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
