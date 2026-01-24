import { JSX, useContext, useEffect } from 'react';

import { ShortcutContext } from '../contexts/ShortcutContext';

import { BiX } from 'react-icons/bi';
import { IconButton } from './Button';
import styles from './Modal.module.scss';
import { Spacer } from './Spacer';

interface ModalProps {
  title: string;
  icon?: JSX.Element;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  bodyClass?: string;
  footer?: React.ReactNode;
  fullScreen?: boolean;
}

export function Modal({
  title,
  icon,
  onClose,
  className,
  bodyClass,
  children,
  footer,
  fullScreen,
}: ModalProps): JSX.Element {
  const { setShortcuts } = useContext(ShortcutContext);

  useEffect(
    () =>
      setShortcuts([
        {
          shortcut: { key: 'Escape' },
          action: onClose,
          description: `Close "${title}" modal.`,
        },
      ]),
    [title, onClose],
  );

  const classes = [styles.modal];
  if (fullScreen) {
    classes.push(styles.fullScreen);
  }
  if (className) {
    classes.push(className);
  }

  const bodyClasses = [styles.main];
  if (bodyClass) {
    bodyClasses.push(bodyClass);
  }

  return (
    <div className={styles.wrapper} onClick={() => onClose()}>
      <div
        className={classes.join(' ')}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className={styles.header}>
          {icon && <div className={styles.icon}>{icon}</div>}
          {title}
          <Spacer />
          <IconButton title="close" onClick={onClose}>
            <BiX />
          </IconButton>
        </div>
        <div className={bodyClasses.join(' ')}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
}
