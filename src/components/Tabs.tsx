import { JSX } from 'react';

import clsx from 'clsx';
import styles from './Tabs.module.css';

export interface TabsType {
  [key: string]: {
    name: React.ReactNode;
    contents: JSX.Element;
  };
}

interface TabsProps {
  tabs: TabsType;
  selectedTab: string;
  setSelectedTab: (tab: string) => void;
  before?: React.ReactNode;
  after?: React.ReactNode;
  className?: string;
}

export function Tabs({
  tabs,
  selectedTab,
  setSelectedTab,
  before,
  after,
  className,
}: TabsProps) {
  if (tabs[selectedTab] == null) {
    setSelectedTab(Object.keys(tabs)[0]);
  }

  return (
    <div className={clsx(className, styles.wrapper)}>
      <div className={styles.header}>
        {before}
        <div className={styles.tabs}>
          {Object.entries(tabs).map(([id, tab]) => {
            const classes = [styles.tab];
            if (id === selectedTab) {
              classes.push(styles.selected);
            }

            return (
              <div
                key={id}
                className={classes.join(' ')}
                tabIndex={0}
                onClick={() => setSelectedTab(id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'Space') {
                    setSelectedTab(id);
                  }
                }}
              >
                {tab.name}
              </div>
            );
          })}
        </div>
        {after}
      </div>
      <div className={styles.contents}>{tabs[selectedTab]?.contents}</div>
    </div>
  );
}
