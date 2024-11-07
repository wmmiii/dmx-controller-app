import React, { useEffect } from 'react';

import styles from './Dropdown.module.scss';

interface DropdownProps {
  className?: string;
  onClose: () => void;
  children: Array<
    {
      type?: 'item',
      title: string,
      icon?: JSX.Element,
      onSelect: () => void,
    } |
    {
      type: 'separator',
    }
  >;
}

export function Dropdown({ className, onClose, children }: DropdownProps) {
  useEffect(() => {
    document.addEventListener('click', onClose);
    () => document.removeEventListener('click', onClose);
  }, []);

  const classes = [styles.dropdown];
  if (className) {
    classes.push(className);
  }

  return (
    <div className={classes.join(' ')}>
      {
        children.map((item, index)=> {
          if (item.type === 'separator') {
            return <hr key={index} />
          } else {
            return (
              <div
                key={index}
                className={styles.item}
                onClick={() => item.onSelect()}>
                <div className={styles.icon}>
                  {
                    item.icon
                  }
                </div>
                {item.title}
              </div>
            )
          }
        })
      }
    </div>
  );
}
