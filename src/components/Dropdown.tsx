import { JSX, useEffect } from 'react';

import styles from './Dropdown.module.css';

interface DropdownProps {
  className?: string;
  onClose: () => void;
  items: Array<
    | {
        type?: 'item';
        title: string;
        icon?: JSX.Element;
        onSelect: () => void;
      }
    | {
        type: 'separator';
      }
  >;
}

export function Dropdown({ className, onClose, items }: DropdownProps) {
  useEffect(() => {
    document.addEventListener('click', onClose);
    return () => document.removeEventListener('click', onClose);
  }, []);

  const classes = [styles.dropdown];
  if (className) {
    classes.push(className);
  }

  return (
    <div className={classes.join(' ')}>
      {items.map((item, index) => {
        if (item.type === 'separator') {
          return <hr key={index} />;
        } else {
          return (
            <div
              key={index}
              className={styles.item}
              onClick={() => item.onSelect()}
            >
              <div className={styles.icon}>{item.icon}</div>
              {item.title}
            </div>
          );
        }
      })}
    </div>
  );
}
