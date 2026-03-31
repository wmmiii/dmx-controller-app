import { create } from '@bufbuild/protobuf';
import {
  InputBindingSchema,
  InputType,
} from '@dmx-controller/proto/controller_pb';
import {
  JSX,
  createRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { BeatContext } from '../contexts/BeatContext';
import { ShortcutContext } from '../contexts/ShortcutContext';

import { BiPulse } from 'react-icons/bi';
import { ProjectContext } from '../contexts/ProjectContext';
import {
  AudioInputCandidate,
  connectAudioInput,
  disconnectAudioInput,
  getBeatT,
  listAudioInputs,
  subscribeToAudioConnectionStatus,
} from '../system_interfaces/beat_detection';
import { listenToTick } from '../util/time';
import { ControllerConnection } from './ControllerConnection';
import { NumberInput } from './Input';
import styles from './LiveBeat.module.css';

interface LiveBeatProps {
  className?: string;
}

export function LiveBeat({ className }: LiveBeatProps): JSX.Element {
  const { project } = useContext(ProjectContext);
  const { setBeat, addBeatSample, sampling } = useContext(BeatContext);
  const { setShortcuts } = useContext(ShortcutContext);
  const indicatorRef = createRef<HTMLDivElement>();

  const [audioDevices, setAudioDevices] = useState<AudioInputCandidate[]>([]);
  const [audioConnected, setAudioConnected] = useState(false);

  const configuredDevice = project.audioConfig?.beatDetectionDevice ?? '';

  const refreshDevices = useCallback(() => {
    listAudioInputs()
      .then(setAudioDevices)
      .catch(() => setAudioDevices([]));
  }, []);

  useEffect(() => {
    refreshDevices();
    return subscribeToAudioConnectionStatus((_deviceName, connected) => {
      setAudioConnected(connected);
      refreshDevices();
    });
  }, [refreshDevices]);

  // Sync connected state with configured device on mount
  useEffect(() => {
    setAudioConnected(configuredDevice !== '');
  }, [configuredDevice]);

  useEffect(() => {
    return listenToTick(async () => {
      const beatT = await getBeatT();
      if (!indicatorRef.current || !beatT) {
        return;
      }
      indicatorRef.current.style.opacity = String(1 - (beatT % 1));
    });
  }, [indicatorRef, project]);

  useEffect(
    () =>
      setShortcuts([
        {
          shortcut: {
            key: 'Space',
          },
          action: () => addBeatSample(),
          description: 'Sample beat.',
        },
      ]),
    [addBeatSample, setShortcuts],
  );

  const beatMatchAction = useMemo(
    () =>
      create(InputBindingSchema, {
        inputType: InputType.BINARY,
        action: {
          case: 'beatMatch',
          value: {},
        },
      }),
    [],
  );

  const setTempoAction = useMemo(
    () =>
      create(InputBindingSchema, {
        inputType: InputType.CONTINUOUS,
        action: {
          case: 'setTempo',
          value: {},
        },
      }),
    [],
  );

  const firstBeatAction = useMemo(
    () =>
      create(InputBindingSchema, {
        inputType: InputType.BINARY,
        action: {
          case: 'firstBeat',
          value: {},
        },
      }),
    [],
  );

  const classes = [styles.liveBeat];
  if (className) {
    classes.push(className);
  }

  const indicatorClasses = [styles.beatIndicator];
  if (sampling) {
    indicatorClasses.push(styles.sampling);
  }
  if (audioConnected) {
    indicatorClasses.push(styles.autoDetecting);
  }

  return (
    <div className={classes.join(' ')}>
      <div ref={indicatorRef} className={indicatorClasses.join(' ')}>
        <BiPulse size={24} />
      </div>

      <NumberInput
        type="integer"
        min={0}
        max={300}
        value={Math.floor(60_000 / (project.liveBeat!.lengthMs || NaN))}
        onChange={(v) => setBeat(60_000 / v)}
      />

      <select
        className={styles.audioSelect}
        value={configuredDevice}
        onChange={(e) => {
          const value = e.target.value;
          if (value === '') {
            disconnectAudioInput().catch(console.error);
          } else {
            connectAudioInput(value).catch(console.error);
          }
        }}
      >
        <option value="">Auto detect: off</option>
        {audioDevices.map((d) => (
          <option key={d.name} value={d.name}>
            {d.name}
          </option>
        ))}
      </select>

      <ControllerConnection
        title="Set BPM"
        iconOnly={false}
        context={{ type: 'live_page' }}
        action={setTempoAction}
        requiredType="slider"
      />
      <ControllerConnection
        title="Set first beat"
        iconOnly={false}
        context={{ type: 'live_page' }}
        action={firstBeatAction}
        requiredType="button"
      />
      <ControllerConnection
        title="Tap to learn"
        iconOnly={false}
        context={{ type: 'live_page' }}
        action={beatMatchAction}
        requiredType="button"
      />
    </div>
  );
}
