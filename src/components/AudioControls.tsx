import { useContext } from 'react';

import { AudioInputContext } from '../contexts/AudioInputContext';
import styles from './AudioControls.module.css';
import { AudioLevels } from './AudioLevels';
import { NumberInput } from './Input';
import { LiveBeat } from './LiveBeat';
import { Select } from './Select';

export function AudioControls() {
  const {
    availableDevices,
    selectedDevice,
    select,
    deselect,
    gainDb,
    setGainDb,
  } = useContext(AudioInputContext);

  return (
    <>
      {selectedDevice && <AudioLevels className={styles.audioLevels} />}
      {selectedDevice && (
        <label className={styles.audioGain}>
          <NumberInput
            mode="db"
            title="Gain dB"
            value={gainDb}
            onChange={setGainDb}
          />
        </label>
      )}
      <Select
        className={styles.audioSelect}
        value={selectedDevice ?? ''}
        onChange={(value) => {
          if (value === '') {
            deselect();
          } else {
            select(value);
          }
        }}
        options={[
          { value: '', label: 'No Audio Input' },
          ...availableDevices.map((d) => ({ value: d.name, label: d.name })),
        ]}
        placeholder="Audio Input"
      />
      <LiveBeat className={styles.beat} />
    </>
  );
}
