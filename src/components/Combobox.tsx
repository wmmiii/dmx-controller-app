import { Combobox as BaseCombobox } from '@base-ui/react/combobox';
import clsx from 'clsx';
import { useMemo, useRef } from 'react';
import { BiX } from 'react-icons/bi';
import styles from './Combobox.module.css';

export interface ComboboxOption<T> {
  value: T;
  label: string;
}

export interface ComboboxGroup<T> {
  label: string;
  items: ComboboxOption<T>[];
}

type ComboboxItems<T> = ComboboxOption<T>[] | ComboboxGroup<T>[];

function isGrouped<T>(items: ComboboxItems<T>): items is ComboboxGroup<T>[] {
  return items.length > 0 && 'items' in items[0];
}

interface ComboboxProps<T> {
  value: T | undefined;
  onChange: (value: T | undefined) => void;
  onFocus?: () => void;
  placeholder: string;
  options: ComboboxItems<T>;
  equals?: (a: T, b: T) => boolean;
  className?: string;
}

export function Combobox<T>({
  value,
  onChange,
  onFocus,
  placeholder,
  options,
  equals,
  className,
}: ComboboxProps<T>) {
  const grouped = isGrouped(options);
  const inputValueRef = useRef('');

  // Find the matching option object for the current value
  const selectedOption = useMemo(() => {
    if (value === undefined) {
      return null;
    }
    const allOptions = grouped
      ? (options as ComboboxGroup<T>[]).flatMap((g) => g.items)
      : (options as ComboboxOption<T>[]);
    const eq = equals ?? ((a: T, b: T) => Object.is(a, b));
    return allOptions.find((opt) => eq(opt.value, value)) ?? null;
  }, [value, options, grouped, equals]);

  return (
    <BaseCombobox.Root<ComboboxOption<T>>
      items={options}
      value={selectedOption}
      onValueChange={(val) => onChange(val?.value)}
      onOpenChange={(open) => {
        if (open) {
          onFocus?.();
        }
      }}
      onInputValueChange={(inputValue) => {
        inputValueRef.current = inputValue;
      }}
      itemToStringLabel={(item) => item.label}
      isItemEqualToValue={
        equals ? (a, b) => equals(a.value, b.value) : undefined
      }
      autoHighlight
    >
      <BaseCombobox.InputGroup className={clsx(className, styles.root)}>
        <BaseCombobox.Input
          className={styles.input}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && inputValueRef.current === '') {
              onChange(undefined);
            }
          }}
        />
        <BaseCombobox.Clear className={styles.clearButton}>
          <BiX />
        </BaseCombobox.Clear>
      </BaseCombobox.InputGroup>
      <BaseCombobox.Portal>
        <BaseCombobox.Positioner
          className={styles.positioner}
          sideOffset={0}
          side="bottom"
        >
          <BaseCombobox.Popup className={styles.dropdown}>
            <BaseCombobox.List>
              {grouped
                ? (group: ComboboxGroup<T>) => (
                    <BaseCombobox.Group className={styles.category}>
                      <BaseCombobox.GroupLabel className={styles.categoryLabel}>
                        {group.label}
                      </BaseCombobox.GroupLabel>
                      {group.items.map((option) => (
                        <BaseCombobox.Item
                          key={option.label}
                          value={option}
                          className={styles.item}
                        >
                          {option.label}
                        </BaseCombobox.Item>
                      ))}
                    </BaseCombobox.Group>
                  )
                : (option: ComboboxOption<T>) => (
                    <BaseCombobox.Item
                      key={option.label}
                      value={option}
                      className={styles.item}
                    >
                      {option.label}
                    </BaseCombobox.Item>
                  )}
            </BaseCombobox.List>
          </BaseCombobox.Popup>
        </BaseCombobox.Positioner>
      </BaseCombobox.Portal>
    </BaseCombobox.Root>
  );
}
