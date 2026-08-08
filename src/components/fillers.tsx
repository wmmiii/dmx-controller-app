import { PropsWithChildren } from 'react';
import styles from './fillers.module.css';

export function Empty({ children }: PropsWithChildren) {
  return (
    <div className={styles.empty}>
      <div className={styles.content}>{children}</div>
    </div>
  );
}

export function Loading() {
  return (
    <div className={styles.loading}>
      <div className={styles.dots}>
        <div
          style={{
            animationDelay: '0ms',
            transform: 'rotate(0deg) translateX(16px) ',
          }}
        />
        <div
          style={{
            animationDelay: '333ms',
            transform: 'rotate(60deg) translateX(16px) ',
          }}
        />
        <div
          style={{
            animationDelay: '666ms',
            transform: 'rotate(120deg) translateX(16px) ',
          }}
        />
        <div
          style={{
            animationDelay: '1000ms',
            transform: 'rotate(180deg) translateX(16px) ',
          }}
        />
        <div
          style={{
            animationDelay: '1333ms',
            transform: 'rotate(240deg) translateX(16px) ',
          }}
        />
        <div
          style={{
            animationDelay: '1666ms',
            transform: 'rotate(300deg) translateX(16px) ',
          }}
        />
      </div>
    </div>
  );
}
