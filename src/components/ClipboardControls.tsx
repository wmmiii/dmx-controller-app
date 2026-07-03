import { Message } from '@bufbuild/protobuf';
import { GenMessage } from '@bufbuild/protobuf/codegenv2';
import { BiCopy, BiPaste } from 'react-icons/bi';

import { useClipboard } from '../contexts/ClipboardContext';

import { IconButton } from './Button';

interface ClipboardControlsProps<T extends Message> {
  typeName: string;
  schema: GenMessage<T>;
  value: T;
  onPaste: (m: T) => void;
}

export function ClipboardControls<T extends Message>({
  typeName,
  schema,
  value,
  onPaste,
}: ClipboardControlsProps<T>) {
  const clipboard = useClipboard();

  return (
    <>
      <IconButton
        title={`Copy ${typeName}`}
        onClick={() => {
          clipboard.set(value);
        }}
      >
        <BiCopy />
      </IconButton>
      <IconButton
        title={`Paste ${typeName}`}
        disabled={!clipboard.has(schema)}
        onClick={() => onPaste(clipboard.get(schema)!)}
      >
        <BiPaste />
      </IconButton>
    </>
  );
}
