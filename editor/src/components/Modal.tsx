import React from 'react';

import styles from "./Modal.module.scss";

interface ModalProps {
  children: React.ReactNode;
}

export function Modal({children}: ModalProps): JSX.Element {
  return (
    <div className={styles.modal}>
      {children}
    </div>
  );
}
