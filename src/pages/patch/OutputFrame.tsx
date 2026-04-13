import { NumberInput, ToggleInput } from '../../components/Input';
import styles from './OutputFrame.module.css';

interface OutputFrameProps {
  outputEnabled: boolean;
  setOutputEnabled: (enabled: boolean) => void;
  fps: number;
  setFps: (fps: number) => void;
  settings: React.ReactNode;
  children: React.ReactNode;
}

export function OutputFrame({
  outputEnabled,
  setOutputEnabled,
  fps,
  setFps,
  settings,
  children,
}: OutputFrameProps) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.settings}>
        <label>
          <span>Enabled</span>
          <ToggleInput
            className={styles.enabledToggle}
            value={outputEnabled}
            onChange={setOutputEnabled}
          />
        </label>
        <label>
          <span>FPS</span>
          &emsp;
          <NumberInput mode="counting" value={fps} onChange={setFps} />
        </label>
        {settings}
      </div>
      <div className={styles.body}>{children}</div>
    </div>
  );
}
