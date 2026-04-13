import { Select as BaseSelect } from '@base-ui/react/select';
import clsx from 'clsx';
import { ReactNode } from 'react';
import { BiChevronDown } from 'react-icons/bi';
import styles from './Select.module.css';

interface SelectOption<T extends string | number> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

interface SelectGroup<T extends string | number> {
  label: ReactNode;
  options: SelectOption<T>[];
}

type SelectItems<T extends string | number> =
  | SelectOption<T>[]
  | SelectGroup<T>[];

function isGrouped<T extends string | number>(
  items: SelectItems<T>,
): items is SelectGroup<T>[] {
  return items.length > 0 && 'options' in items[0];
}

interface SelectProps<T extends string | number> {
  value: T;
  onChange: (value: T) => void;
  options: SelectItems<T>;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function Select<T extends string | number>({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className,
}: SelectProps<T>) {
  const grouped = isGrouped(options);

  const allOptions = grouped
    ? options.flatMap((g) => g.options)
    : (options as SelectOption<T>[]);

  const selectedOption = allOptions.find((opt) => opt.value === value);

  const renderOptions = (items: SelectOption<T>[]): ReactNode =>
    items.map((option) => (
      <BaseSelect.Item
        key={String(option.value)}
        value={option.value}
        disabled={option.disabled}
        className={styles.item}
      >
        <BaseSelect.ItemText>{option.label}</BaseSelect.ItemText>
      </BaseSelect.Item>
    ));

  return (
    <BaseSelect.Root
      value={value}
      onValueChange={(newValue) => onChange(newValue as T)}
      disabled={disabled}
    >
      <BaseSelect.Trigger className={clsx(styles.trigger, className)}>
        <BaseSelect.Value placeholder={placeholder}>
          {selectedOption?.label}
        </BaseSelect.Value>
        <BaseSelect.Icon className={styles.icon}>
          <BiChevronDown />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner
          className={styles.positioner}
          side="bottom"
          align="start"
          alignItemWithTrigger={false}
          collisionAvoidance={{ side: 'none' }}
        >
          <BaseSelect.Popup className={styles.popup}>
            {grouped
              ? options.map((group, i) => (
                  <BaseSelect.Group key={i} className={styles.group}>
                    <BaseSelect.GroupLabel className={styles.groupLabel}>
                      {group.label}
                    </BaseSelect.GroupLabel>
                    {renderOptions(group.options)}
                  </BaseSelect.Group>
                ))
              : renderOptions(options as SelectOption<T>[])}
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
