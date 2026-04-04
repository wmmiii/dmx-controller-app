import { Dialog } from 'radix-ui';
import { JSX, useContext, useEffect, useRef, useState } from 'react';

import { ShortcutContext } from '../contexts/ShortcutContext';

import clsx from 'clsx';
import { BiX } from 'react-icons/bi';
import { IconButton } from './Button';
import styles from './Modal.module.css';
import { Spacer } from './Spacer';

interface ModalProps {
  title: React.ReactNode;
  icon?: JSX.Element;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  bodyClass?: string;
  footer?: React.ReactNode;
  fullScreen?: boolean;
}

export function Modal({
  title,
  icon,
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
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    let observer: ResizeObserver | null = null;

    const frameId = requestAnimationFrame(() => {
      const contentEle = mainRef.current;
      const mainEle = mainWrapperRef.current;
      if (!contentEle || !mainEle) return;

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
        <Dialog.Overlay className={styles.wrapper}>
          <Dialog.Content
            className={clsx(
              styles.modal,
              { [styles.fullScreen]: fullScreen, [styles.overflow]: overflow },
              className,
            )}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => {
              onClose();
              e.stopPropagation();
              e.preventDefault();
            }}
          >
            <div className={styles.header}>
              {icon && <div className={styles.icon}>{icon}</div>}
              <Dialog.Title className={styles.title}>{title}</Dialog.Title>
              <Spacer />
              <Dialog.Close asChild>
                <IconButton title="close" onClick={onClose}>
                  <BiX />
                </IconButton>
              </Dialog.Close>
            </div>
            <Dialog.Description asChild>
              <div ref={mainWrapperRef} className={styles.mainWrapper}>
                <div ref={mainRef} className={clsx(styles.main, bodyClass)}>
                  {children}
                </div>
              </div>
            </Dialog.Description>
            {footer && <div className={styles.footer}>{footer}</div>}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
