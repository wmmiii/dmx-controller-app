import { BiSolidError } from 'react-icons/bi';

import clsx from 'clsx';
import style from './Warning.module.css';

interface WarningProps {
  title: string;
  className?: string;
}

export function Warning({ title, className }: WarningProps) {
  return (
    <div className={clsx(style.warning, className)} title={title}>
      <BiSolidError />
    </div>
  );
}
