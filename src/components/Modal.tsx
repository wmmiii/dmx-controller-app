import { Dialog } from '@base-ui/react';
import { JSX, useContext, useEffect, useRef, useState } from 'react';

import { ShortcutContext } from '../contexts/ShortcutContext';

import clsx from 'clsx';
import { BiX } from 'react-icons/bi';
import { IconButton } from './Button';
import styles from './Modal.module.css';
import { Spacer } from './Spacer';

interface ModalProps {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  bodyClass?: string;
  footer?: React.ReactNode;
  fullScreen?: boolean;
}

export function Modal({
  title,
  onClose,
  className,
  bodyClass,
  children,
  footer,
  fullScreen,
}: ModalProps): JSX.Element {
  const { setShortcuts } = useContext(ShortcutContext);
  const mainWrapperRef = useRef<HTMLDivElement | null>(null);
  const mainRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    let observer: ResizeObserver | null = null;

    const frameId = requestAnimationFrame(() => {
      const contentEle = mainRef.current;
      const mainEle = mainWrapperRef.current;
      if (!contentEle || !mainEle) {
        return;
      }

      const checkOverflow = () =>
        setOverflow(mainEle.scrollHeight > mainEle.clientHeight);
      observer = new ResizeObserver(checkOverflow);
      checkOverflow();

      observer.observe(contentEle);
      observer.observe(mainEle);
    });

    return () => {
      cancelAnimationFrame(frameId);
      observer?.disconnect();
    };
  }, []);

  useEffect(
    () =>
      setShortcuts([
        {
          shortcut: { key: 'Escape' },
          action: onClose,
          description: `Close "${title}" modal.`,
        },
      ]),
    [title, onClose],
  );

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.wrapper} />
        <Dialog.Popup
          className={clsx(
            styles.modal,
            { [styles.fullScreen]: fullScreen, [styles.overflow]: overflow },
            className,
          )}
          initialFocus={() => {
            if (!footerRef.current) {
              return true;
            }
            const focusable = footerRef.current.querySelectorAll<HTMLElement>(
              'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
            );
            return focusable[focusable.length - 1] ?? true;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              onClose();
              e.stopPropagation();
              e.preventDefault();
            }
          }}
        >
          <div className={styles.header}>
            <Dialog.Title className={styles.title}>{title}</Dialog.Title>
            <Spacer />
            <Dialog.Close
              render={
                <IconButton title="close" onClick={onClose}>
                  <BiX />
                </IconButton>
              }
            />
          </div>
          <Dialog.Description
            render={<div ref={mainWrapperRef} className={styles.mainWrapper} />}
          >
            <div ref={mainRef} className={clsx(bodyClass, styles.main)}>
              {children}
            </div>
          </Dialog.Description>
          {footer && (
            <div ref={footerRef} className={styles.footer}>
              {footer}
            </div>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
