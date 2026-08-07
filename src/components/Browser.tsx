import clsx from 'clsx';
import styles from './Browser.module.css';
import { EditableText } from './Input';

type BrowserProps = {
  className?: string;
  items: Array<
    | string
    | {
        key?: string;
        name: string;
        setName: (name: string) => void;
        selected: boolean;
        onSelect: () => void;
        dim?: boolean;
        renderContent?: (name: React.ReactNode) => React.ReactNode;
      }
  >;
  listHeader?: React.ReactNode;
} & (
  | {
      emptyPlaceholder: string;
      children: React.ReactNode;
    }
  // If we are just rendering the tabs then neither the placeholder nor the children will be set.
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
                {item.renderContent ? item.renderContent(name) : name}
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
