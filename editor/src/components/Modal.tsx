import React, { useContext, useEffect } from 'react';

import styles from "./Modal.module.scss";
import { IconButton } from './Button';
import IconBxX from '../icons/IconBxX';
import { ShortcutContext } from '../contexts/ShortcutContext';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  fullScreen?: boolean;
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  fullScreen,
}: ModalProps): JSX.Element {
  const { setShortcuts } = useContext(ShortcutContext);

  useEffect(() => setShortcuts([
    {
      shortcut: { key: 'Escape' },
      action: onClose,
      description: `Close "${title}" modal.`,
    }
  ]), [title, onClose]);

  const classes = [styles.modal];
  if (fullScreen) {
    classes.push(styles.fullScreen);
  }



  return (
    <div className={styles.wrapper} onClick={() => onClose()}>
      <div className={classes.join(' ')} onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}>
        <div className={styles.header}>
          {title}
          <div className={styles.spacer}></div>
          <IconButton onClick={onClose}>
            <IconBxX />
          </IconButton>
        </div>
        <div className={styles.main}>
          {children}
        </div>
        {
          footer &&
          <div className={styles.footer}>
            {footer}
          </div>
        }
      </div>
    </div>
  );
}
