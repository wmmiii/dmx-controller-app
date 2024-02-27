import React from 'react';

import styles from "./SplitPane.module.scss";

interface HorizontalSplitPaneProps {
  className?: string;
  left: React.ReactNode;
  right: React.ReactNode;
}

export function HorizontalSplitPane(
  { className, left, right }: HorizontalSplitPaneProps): JSX.Element {

  const paneClasses = [styles.horizontalPane];
  if (className) {
    paneClasses.push(className);
  }

  return (
    <div className={paneClasses.join(' ')}>
      <div className={styles.pane}>{left}</div>
      <div className={styles.pane}>{right}</div>
    </div>
  );
} 