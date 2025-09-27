import { BiSolidError } from 'react-icons/bi';
import style from './Warning.module.scss';

interface WarningProps {
  title: string;
  className?: string;
}

export function Warning({ title, className }: WarningProps) {
  const classes = [style.warning];
  if (className) {
    classes.push(className);
  }

  return (
    <div className={classes.join(' ')} title={title}>
      <BiSolidError />
    </div>
  );
}
