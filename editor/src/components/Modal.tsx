import { JSX, useContext, useEffect } from 'react';

import styles from './Modal.module.scss';
import { IconButton } from './Button';
import IconBxX from '../icons/IconBxX';
import { ShortcutContext } from '../contexts/ShortcutContext';

interface ModalProps {
  title: string;
  icon?: JSX.Element;
  onClose: () => void;
  children: React.ReactNode;
  bodyClass?: string;
  footer?: React.ReactNode;
  fullScreen?: boolean;
}

export function Modal({
  title,
  icon,
  onClose,
  bodyClass,
  children,
  footer,
  fullScreen,
}: ModalProps): JSX.Element {
  const { setShortcuts } = useContext(ShortcutContext);

  useEffect(() => {
    history.pushState(title, '');

    const listener = (ev: PopStateEvent) => {
      if (ev.state === title) {
        onClose();
      }
    };
    window.addEventListener('popstate', listener);
    return () => window.removeEventListener('popstate', listener);
  }, [title, onClose]);

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
          <div className={styles.spacer}></div>
          <IconButton title="close" onClick={onClose}>
            <IconBxX />
          </IconButton>
        </div>
        <div className={bodyClasses.join(' ')}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
}
