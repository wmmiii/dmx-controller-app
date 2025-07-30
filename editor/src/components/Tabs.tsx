import { JSX } from 'react';

import styles from './Tabs.module.scss';

interface TabsProps {
  tabs: {
    [key: string]: {
      name: string;
      contents: JSX.Element;
    };
  };
  selectedTab: string;
  setSelectedTab: (tab: string) => void;
  className?: string;
}

export function Tabs({
  tabs,
  selectedTab,
  setSelectedTab,
  className,
}: TabsProps) {
  const classes = [styles.wrapper];
  if (className) {
    classes.push(className);
  }

  return (
    <div className={classes.join(' ')}>
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
      <div className={styles.contents}>{tabs[selectedTab].contents}</div>
    </div>
  );
}
