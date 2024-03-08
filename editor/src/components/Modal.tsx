import React from 'react';

import styles from "./Modal.module.scss";
import { IconButton } from './Button';
import IconBxX from '../icons/IconBxX';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function Modal({ title, onClose, children }: ModalProps): JSX.Element {
  return (
    <div className={styles.wrapper} onClick={() => onClose()}>
      <div className={styles.modal} onClick={(e) => {
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
        {children}
      </div>
    </div>
  );
}
