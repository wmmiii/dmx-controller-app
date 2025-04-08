import styles from 'Popover.module.scss';
import { Popover as RadixPopover } from 'radix-ui';

interface PopoverProps {
  onClose: () => void;
  popover: React.ReactNode;
  children: React.ReactNode;
}

export function Popover({ onClose, popover, children }: PopoverProps) {
  return (
    <RadixPopover.Root
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <RadixPopover.Trigger asChild>{children}</RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content className={styles.content}>
          {popover}
          <RadixPopover.Arrow fill="currentColor" className={styles.arrow} />
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}
