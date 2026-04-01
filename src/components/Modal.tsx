import { Dialog } from 'radix-ui';
import { JSX, useContext, useEffect } from 'react';

import { ShortcutContext } from '../contexts/ShortcutContext';

import { BiX } from 'react-icons/bi';
import { IconButton } from './Button';
import styles from './Modal.module.css';
import { Spacer } from './Spacer';

interface ModalProps {
  title: string;
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

  const classes = [styles.modal];
  if (fullScreen) {
    classes.push(styles.fullScreen);
  }
  if (className) {
    classes.push(className);
  }

  const bodyClasses = [styles.main];
  if (bodyClass) {
    bodyClasses.push(bodyClass);
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.wrapper}>
          <Dialog.Content
            className={classes.join(' ')}
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
              <div className={bodyClasses.join(' ')}>{children}</div>
            </Dialog.Description>
            {footer && <div className={styles.footer}>{footer}</div>}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
