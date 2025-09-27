import { JSX } from 'react';

import styles from './Tabs.module.scss';

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
  const classes = [styles.wrapper];
  if (className) {
    classes.push(className);
  }

  if (tabs[selectedTab] == null) {
    setSelectedTab(Object.keys(tabs)[0]);
  }

  return (
    <div className={classes.join(' ')}>
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
                tabIndex={-1}
                onClick={() => setSelectedTab(id)}
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
