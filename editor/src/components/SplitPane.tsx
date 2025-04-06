import { JSX, createRef, useEffect, useState } from "react";

import styles from "./SplitPane.module.scss";

interface HorizontalSplitPaneProps {
  className?: string;
  defaultAmount?: number;
  left: React.ReactNode;
  right: React.ReactNode;
}

export function HorizontalSplitPane({
  className,
  defaultAmount,
  left,
  right,
}: HorizontalSplitPaneProps): JSX.Element {
  const containerRef = createRef<HTMLDivElement>();
  const [dragging, setDragging] = useState(false);
  const [amount, setAmount] = useState(defaultAmount || 0.5);

  const paneClasses = [styles.horizontalPane];
  if (dragging) {
    paneClasses.push(styles.dragging);
  }
  if (className) {
    paneClasses.push(className);
  }

  useEffect(() => {
    if (dragging) {
      document.body.style.userSelect = "none";
      return () => {
        document.body.style.userSelect = "";
      };
    } else {
      return undefined;
    }
  }, [dragging]);

  return (
    <div className={paneClasses.join(" ")} ref={containerRef}>
      {dragging && (
        <div
          className={styles.overlay}
          onMouseMove={(e) => {
            if (containerRef.current == null) {
              throw new Error("Cannot find split pane container reference!");
            }
            const boundingRect = containerRef.current.getBoundingClientRect();
            const containerX = e.clientX - boundingRect.left;
            const amount = containerX / boundingRect.width;
            setAmount(amount);
          }}
          onMouseUp={() => setDragging(false)}
        ></div>
      )}
      <div className={styles.pane} style={{ flex: amount }}>
        {left}
      </div>
      <div
        className={styles.separator}
        onMouseDown={() => setDragging(true)}
      ></div>
      <div className={styles.pane} style={{ flex: 1 - amount }}>
        {right}
      </div>
    </div>
  );
}
