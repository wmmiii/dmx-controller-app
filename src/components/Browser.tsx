import clsx from 'clsx';
import { createContext, useContext } from 'react';
import styles from './Browser.module.css';
import { EditableText } from './Input';

const OutletContext = createContext<React.ReactNode>(null);

/**
 * Renders the item's editable name. Place it anywhere inside an item's
 * `element` to control what surrounds the name (e.g. a progress bar beneath it).
 */
export function Outlet() {
  return <>{useContext(OutletContext)}</>;
}

type BrowserProps = {
  className: string;
  items: Array<
    | string
    | {
        name: string;
        setName: (name: string) => void;
        selected: boolean;
        onSelect: () => void;
        dim?: boolean;
        element?: React.ReactNode;
        // Stable identity for the row. Provide it when rows can reorder so a
        // moved row keeps its React instance (and any local state).
        key?: string;
      }
  >;
  listHeader?: React.ReactNode;
} & (
  | {
      emptyPlaceholder: string;
      children: React.ReactNode;
    }
  | {
      emptyPlaceholder?: undefined;
      children?: undefined;
    }
);

export function Browser({
  className,
  items,
  listHeader,
  emptyPlaceholder,
  children,
}: BrowserProps) {
  return (
    <div
      className={clsx(className, styles.wrapper, {
        [styles.listOnly]: !emptyPlaceholder,
      })}
    >
      <div className={styles.listContainer}>
        {listHeader && <div className={styles.header}>{listHeader}</div>}
        <div className={styles.list}>
          {items.length === 0 && <h3>No items</h3>}
          {items.map((item, i) => {
            if (typeof item === 'string') {
              return <h3 key={i}>{item}</h3>;
            }
            const name = (
              <EditableText
                value={item.name}
                onChange={(newName) => {
                  if (newName) {
                    item.setName(newName);
                  }
                }}
              />
            );
            return (
              <div
                key={item.key ?? i}
                className={clsx(styles.item, {
                  [styles.selected]: item.selected,
                  [styles.dim]: item.dim,
                })}
                onClick={item.onSelect}
              >
                {item.element != null ? (
                  <OutletContext.Provider value={name}>
                    {item.element}
                  </OutletContext.Provider>
                ) : (
                  name
                )}
              </div>
            );
          })}
        </div>
      </div>
      {emptyPlaceholder ? (
        <div className={styles.content}>
          {children ? (
            children
          ) : (
            <div className={styles.empty}>{emptyPlaceholder}</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
