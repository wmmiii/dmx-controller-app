import { Popover } from '@base-ui/react';
import clsx from 'clsx';
import { useMemo, useRef, useState } from 'react';
import { BiX } from 'react-icons/bi';
import { IconButton } from './Button';
import styles from './SelectInput.module.css';

export interface SelectOption<T> {
  value: T;
  label: string;
}

export interface SelectCategory<T> {
  label: string;
  options: SelectOption<T>[];
}

type SelectItems<T> = SelectOption<T>[] | SelectCategory<T>[];

interface SelectValueInputProps<T> {
  value: T | undefined;
  onChange: (value: T | undefined) => void;
  onClear?: () => void;
  onFocus?: () => void;
  onBlur?: (value: string) => void;
  placeholder: string;
  options: SelectItems<T>;
  equals?: (a: T | undefined, b: T | undefined) => boolean;
  className?: string;
}

export function SelectInput<T>({
  value,
  onChange,
  onClear,
  onFocus,
  onBlur,
  placeholder,
  options,
  equals = (a, b) => a === b,
  className,
}: SelectValueInputProps<T>) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Determine if items are categories or simple options
  const isCategories =
    options &&
    options.length > 0 &&
    typeof options[0] === 'object' &&
    'options' in options[0];

  // Flatten all options for lookup
  const allOptions = useMemo(() => {
    const result: SelectOption<T>[] = [];
    if (isCategories) {
      const categories = options as SelectCategory<T>[];
      for (const category of categories) {
        result.push(...category.options);
      }
    } else {
      result.push(...(options as SelectOption<T>[]));
    }
    return result;
  }, [options, isCategories]);

  // Find the label for the current value
  const label = useMemo(() => {
    if (value === undefined) {
      return '';
    }
    const option = allOptions.find((opt) => equals(opt.value, value));
    if (option) {
      return option.label;
    }
    // For arbitrary string values (like serial ports typed manually)
    if (typeof value === 'string') {
      return value;
    }
    return '';
  }, [value, allOptions, equals]);

  // Fuzzy match function
  const fuzzyMatch = (search: string, target: string): boolean => {
    const searchLower = search.toLowerCase();
    const targetLower = target.toLowerCase();
    let searchIndex = 0;

    for (
      let i = 0;
      i < targetLower.length && searchIndex < searchLower.length;
      i++
    ) {
      if (targetLower[i] === searchLower[searchIndex]) {
        searchIndex++;
      }
    }

    return searchIndex === searchLower.length;
  };

  // Filter items based on search query
  const filteredItems = useMemo(() => {
    if (!options || searchQuery === '') {
      return options;
    }

    if (isCategories) {
      const categories = options as SelectCategory<T>[];
      return categories
        .map((category) => ({
          label: category.label,
          options: category.options.filter((option) =>
            fuzzyMatch(searchQuery, option.label),
          ),
        }))
        .filter((category) => category.options.length > 0);
    } else {
      const simpleItems = options as SelectOption<T>[];
      return simpleItems.filter((option) =>
        fuzzyMatch(searchQuery, option.label),
      );
    }
  }, [options, searchQuery, isCategories]);

  const handleSelect = (selectedValue: T) => {
    onChange(selectedValue);
    setOpen(false);
    setSearchQuery('');
  };

  const handleClear = () => {
    if (onClear) {
      onClear();
    } else {
      onChange(undefined);
    }
    setSearchQuery('');
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setSearchQuery('');
      onFocus?.();
    } else {
      onBlur?.(searchQuery);
      setSearchQuery('');
    }
    setOpen(isOpen);
  };

  const hasItems =
    filteredItems &&
    (isCategories
      ? (filteredItems as SelectCategory<T>[]).some(
          (cat) => cat.options.length > 0,
        )
      : filteredItems.length > 0);

  const displayValue = open ? searchQuery : label;

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <div
        ref={containerRef}
        className={clsx(className, styles.root, { [styles.open]: open })}
      >
        <input
          ref={inputRef}
          type="text"
          className={styles.input}
          placeholder={placeholder}
          value={displayValue}
          onClick={() => {
            if (!open) {
              setOpen(true);
            }
          }}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            if (!open) {
              setOpen(true);
            }
          }}
          onKeyDown={(e) => {
            if (e.code === 'Escape') {
              setOpen(false);
              inputRef.current?.blur();
            } else if (e.code === 'Enter') {
              // Select first option that exactly matches the search query
              const match = allOptions.find((opt) => opt.label === searchQuery);
              if (match) {
                e.preventDefault();
                handleSelect(match.value);
                inputRef.current?.blur();
              }
            } else if (e.code === 'Tab' && open && !e.shiftKey) {
              // Move focus to first item in dropdown
              const firstItem =
                dropdownRef.current?.querySelector<HTMLElement>(
                  '[tabindex="0"]',
                );
              if (firstItem) {
                e.preventDefault();
                firstItem.focus();
              }
            }
          }}
        />
        {value !== undefined && (
          <IconButton
            className={styles.clearButton}
            title="Clear"
            onClick={() => handleClear()}
          >
            <BiX />
          </IconButton>
        )}
      </div>

      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          anchor={containerRef}
          className={styles.popoverPositioner}
        >
          <Popover.Popup
            ref={dropdownRef}
            className={styles.dropdown}
            initialFocus={inputRef}
            onKeyDown={(e) => {
              if (e.code === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
                inputRef.current?.focus();
              } else if (e.code === 'Tab' && e.shiftKey) {
                // Check if we're on the first item
                const items =
                  dropdownRef.current?.querySelectorAll<HTMLElement>(
                    '[tabindex="0"]',
                  );
                if (items && items[0] === document.activeElement) {
                  e.preventDefault();
                  inputRef.current?.focus();
                }
              }
            }}
          >
            {hasItems &&
              (isCategories ? (
                (filteredItems as SelectCategory<T>[]).map(
                  (category, categoryIndex) => (
                    <div key={categoryIndex} className={styles.category}>
                      <div className={styles.categoryLabel}>
                        {category.label}
                      </div>
                      <ul className={styles.list}>
                        {category.options.map((option, optionIndex) => (
                          <Option
                            key={`${categoryIndex}-${optionIndex}`}
                            option={option}
                            selected={equals(option.value, value)}
                            handleSelect={handleSelect}
                          />
                        ))}
                      </ul>
                    </div>
                  ),
                )
              ) : (
                <ul className={styles.list}>
                  {(filteredItems as SelectOption<T>[]).map((option, index) => (
                    <Option
                      key={index}
                      option={option}
                      selected={equals(option.value, value)}
                      handleSelect={handleSelect}
                    />
                  ))}
                </ul>
              ))}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

interface OptionProps<T> {
  option: SelectOption<T>;
  selected: boolean;
  handleSelect: (value: T) => void;
}

function Option<T>({ option, selected, handleSelect }: OptionProps<T>) {
  const classes = [styles.item];
  if (selected) {
    classes.push(styles.selected);
  }
  return (
    <li
      role="option"
      aria-selected={selected}
      tabIndex={0}
      className={classes.join(' ')}
      onClick={() => handleSelect(option.value)}
      onKeyDown={(e) => {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          handleSelect(option.value);
        }
      }}
    >
      {option.label}
    </li>
  );
}
