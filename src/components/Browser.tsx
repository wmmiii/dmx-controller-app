import clsx from 'clsx';
import styles from './Browser.module.css';
import { EditableText } from './Input';

interface BrowserProps {
  className: string;
  items: Array<
    | string
    | {
        name: string;
        setName: (name: string) => void;
        selected: boolean;
        onSelect: () => void;
        dim?: boolean;
      }
  >;
  listHeader?: React.ReactNode;
  emptyPlaceholder: string;
  children: React.ReactNode;
}

export function Browser({
  className,
  items,
  listHeader,
  emptyPlaceholder,
  children,
}: BrowserProps) {
  return (
    <div className={clsx(className, styles.wrapper)}>
      <div className={styles.listContainer}>
        {listHeader && <div className={styles.header}>{listHeader}</div>}
        <div className={styles.list}>
          {items.length === 0 && <h3>No items</h3>}
          {items.map((item, i) => {
            if (typeof item === 'string') {
              return <h3 key={i}>{item}</h3>;
            }
            return (
              <div
                className={clsx(styles.item, {
                  [styles.selected]: item.selected,
                  [styles.dim]: item.dim,
                })}
                onClick={item.onSelect}
              >
                <EditableText
                  value={item.name}
                  onChange={(name) => {
                    if (name) {
                      item.setName(name);
                    }
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className={styles.content}>
        {children ? (
          children
        ) : (
          <div className={styles.empty}>{emptyPlaceholder}</div>
        )}
      </div>
    </div>
  );
}
