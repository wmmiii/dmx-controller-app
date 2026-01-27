import { useMemo, useRef, useState } from 'react';
import { BiX } from 'react-icons/bi';
import styles from './SelectInput.module.scss';

export interface SelectOption<T> {
  value: T;
  label: string;
}

export interface SelectCategory<T> {
  label: string;
  options: SelectOption<T>[];
}

export type SelectItems<T> = SelectOption<T>[] | SelectCategory<T>[];

interface SelectValueInputProps<T> {
  value: T | undefined;
  onChange: (value: T | undefined) => void;
  onClear?: () => void;
  onFocus?: () => void;
  onBlur?: (value: string) => void;
  placeholder: string;
  options: SelectItems<T>;
  equals?: (a: T, b: T) => boolean;
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
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const label = useMemo(() => {
    if (value === undefined) {
      return '';
    }

    const isCategories =
      options &&
      options.length > 0 &&
      typeof options[0] === 'object' &&
      'options' in options[0];

    if (isCategories) {
      const categories = options as SelectCategory<T>[];
      for (const category of categories) {
        const option = category.options.find((opt) => equals(opt.value, value));
        if (option) {
          return option.label;
        }
      }
    } else {
      const simpleOptions = options as SelectOption<T>[];
      const option = simpleOptions.find((opt) => equals(opt.value, value));
      if (option) {
        return option.label;
      }
    }

    throw Error(`Unknown value in select: ${value}`);
  }, [value, options]);

  const handleSelect = (selectedValue: typeof value) => {
    console.log('select', selectedValue);
    onChange(selectedValue);
    setTimeout(() => {
      inputRef.current?.blur();
    }, 0);
  };

  // Fuzzy match function - checks if search chars appear in order in the target
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

  // Determine if items are categories or simple options
  const isCategories =
    options &&
    options.length > 0 &&
    typeof options[0] === 'object' &&
    'options' in options[0];

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

  const hasItems = filteredItems && filteredItems.length > 0;

  const displayValue = isOpen ? searchQuery : label;

  return (
    <div className={`${styles.root} ${className || ''}`} ref={dropdownRef}>
      <input
        ref={inputRef}
        type="text"
        className={styles.input}
        placeholder={placeholder}
        value={displayValue}
        onChange={(e) => {
          const newValue = e.target.value;
          if (isOpen) {
            // When dropdown is open, update search query
            setSearchQuery(newValue);
          }
        }}
        onKeyDown={(e) => {
          switch (e.code) {
            case 'Escape':
            case 'Enter':
              inputRef.current?.blur();
              break;
          }
        }}
        onFocus={() => {
          setIsOpen(true);
          setSearchQuery('');
          onFocus?.();
        }}
        onBlur={() => {
          console.log('blur', searchQuery);
          setTimeout(() => {
            setIsOpen(false);
            onBlur?.(searchQuery);
            setSearchQuery('');
          }, 100);
        }}
      />
      {value && (
        <button
          className={styles.clearButton}
          onClick={() => {
            if (onClear) {
              onClear();
            } else {
              onChange(undefined);
            }
            setSearchQuery('');
          }}
          type="button"
          aria-label="Clear selection"
        >
          <BiX />
        </button>
      )}

      {isOpen && hasItems && (
        <div className={styles.dropdown}>
          {isCategories ? (
            // Render categorized options
            (filteredItems as SelectCategory<T>[]).map(
              (category, categoryIndex) => (
                <div key={categoryIndex} className={styles.category}>
                  <div className={styles.categoryLabel}>{category.label}</div>
                  <ul className={styles.list}>
                    {category.options.map((option) => (
                      <li
                        key={String(option.value)}
                        className={styles.item}
                        onClick={() => handleSelect(option.value)}
                      >
                        {option.label}
                      </li>
                    ))}
                  </ul>
                </div>
              ),
            )
          ) : (
            // Render simple items list
            <ul className={styles.list}>
              {(filteredItems as Array<SelectOption<T>>).map((item) => (
                <li
                  key={String(item.value)}
                  className={styles.item}
                  onClick={() => handleSelect(item.value)}
                >
                  {item.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
