import { Popover as BasePopover } from '@base-ui/react';
import clsx from 'clsx';
import { RefObject } from 'react';
import styles from './Popover.module.css';

interface PopoverProps {
  open?: boolean;
  onOpenChange: (open: boolean) => void;
  initialFocus?: RefObject<HTMLElement | null>;
  side?: BasePopover.Positioner.Props['side'];
  arrow?: boolean;
  className?: string;
  popover: React.ReactNode;
  children: React.ReactNode;
}

export function Popover({
  open,
  onOpenChange,
  initialFocus,
  side,
  arrow,
  className,
  popover,
  children,
}: PopoverProps) {
  return (
    <BasePopover.Root open={open} onOpenChange={onOpenChange}>
      <BasePopover.Trigger
        render={children as React.ReactElement}
        nativeButton={false}
      />
      <BasePopover.Portal>
        <BasePopover.Positioner
          className={styles.positioner}
          sideOffset={arrow !== false ? 8 : 0}
          side={side}
        >
          <BasePopover.Popup
            className={clsx(className, styles.content)}
            initialFocus={initialFocus}
          >
            {popover}
            {arrow !== false && (
              <BasePopover.Arrow className={styles.arrow}>
                <ArrowSvg />
              </BasePopover.Arrow>
            )}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}

function ArrowSvg(props: React.ComponentProps<'svg'>) {
  return (
    <svg width="20" height="10" viewBox="0 0 20 10" fill="none" {...props}>
      {' '}
      <path
        d="M9.66437 2.60207L4.80758 6.97318C4.07308 7.63423 3.11989 8 2.13172 8H0V10H20V8H18.5349C17.5468 8 16.5936 7.63423 15.8591 6.97318L11.0023 2.60207C10.622 2.2598 10.0447 2.25979 9.66437 2.60207Z"
        className={styles.arrowFill}
      />{' '}
    </svg>
  );
}
