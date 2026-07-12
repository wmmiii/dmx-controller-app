import { create } from '@bufbuild/protobuf';
import {
  Track,
  Track_BeatKeyframeSchema,
} from '@dmx-controller/proto/audio_pb';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  BiFastForward,
  BiPause,
  BiPlay,
  BiPlus,
  BiReset,
  BiRewind,
} from 'react-icons/bi';
import {
  getCurrentTimeMs,
  getPlaybackStatus,
  jog,
  load,
  pause,
  play,
  seek,
} from '../audio/audioTrackRegistry';
import { Browser } from '../components/Browser';
import { Button, IconButton } from '../components/Button';
import { NumberInput } from '../components/Input';
import { Spacer } from '../components/Spacer';
import { Waveform } from '../components/Waveform';
import { ProjectContext } from '../contexts/ProjectContext';
import { usePlaybackStatus } from '../hooks/playbackStatus';
import { useWaveform } from '../hooks/waveform';
import { importAudioFile } from '../system_interfaces/cas';
import { listenToTick } from '../util/time';
import { getTrackBeatConverters, preloadWasm } from '../wasm/engine';
import styles from './AssetBrowserPage.module.css';

const JOG_MS = 5_000;

export default function AssetBrowserPage() {
  const { project, save } = useContext(ProjectContext);
  const [selectedId, setSelectedId] = useState<bigint | null>(null);

  const selectedTrack = useMemo(
    () => project.tracks[String(selectedId)],
    [project, selectedId],
  );

  return (
    <Browser
      className={styles.browser}
      items={Object.entries(project.tracks)
        .sort(([_a, a], [_b, b]) => a.name.localeCompare(b.name))
        .map(([id, track]) => ({
          name: track.name,
          setName: (name) => {
            const oldName = track.name;
            track.name = name;
            save(`Rename track '${oldName}' to '${name}'.`);
          },
          selected: BigInt(id) === selectedId,
          onSelect: () => setSelectedId(BigInt(id)),
        }))}
      listHeader={
        <Button
          icon={<BiPlus size={18} />}
          onClick={async () => {
            const id = await importAudioFile();
            if (id != null) {
              setSelectedId(id);
            }
          }}
        >
          Add track
        </Button>
      }
      emptyPlaceholder="Select a track to edit."
    >
      {selectedId !== null && selectedTrack != null ? (
        <TrackDetails trackId={selectedId} track={selectedTrack} />
      ) : null}
    </Browser>
  );
}

interface TrackDetailsProps {
  trackId: bigint;
  track: Track;
}

function TrackDetails({ trackId, track }: TrackDetailsProps) {
  const { project, save } = useContext(ProjectContext);
  const [viewStart, setViewStart] = useState<number>(0);
  const [viewEnd, setViewEnd] = useState<number | null>(null);
  const [wasmReady, setWasmReady] = useState(false);
  const playbackStatus = usePlaybackStatus(trackId);
  const timeIndicatorRef = useRef<HTMLSpanElement>(null);
  const beatIndicatorRef = useRef<HTMLSpanElement>(null);

  const playing = playbackStatus === 'playing';
  const loaded = playing || playbackStatus === 'paused';

  useEffect(() => {
    preloadWasm().then(() => setWasmReady(true));
  }, []);

  useEffect(() => {
    load(project, trackId).catch((error) =>
      console.error('Failed to load track', trackId, error),
    );
  }, [project, trackId]);

  useEffect(() => {
    return () => {
      if (getPlaybackStatus(trackId) === 'playing') {
        pause(trackId);
      }
    };
  }, [trackId]);

  const bpmKeyframe = track.beatKeyframes.find((k) => k.info.case === 'bpm');
  const firstBeatKeyframe = track.beatKeyframes.find(
    (k) => k.info.case === 'beat',
  );
  const bpm = bpmKeyframe?.info.case === 'bpm' ? bpmKeyframe.info.value : 0;
  const firstBeatMs = firstBeatKeyframe ? Number(firstBeatKeyframe.t) : 0;

  const setBpm = (bpm: number) => {
    if (bpmKeyframe) {
      bpmKeyframe.info = { case: 'bpm', value: bpm };
    } else {
      track.beatKeyframes.push(
        create(Track_BeatKeyframeSchema, {
          t: 0n,
          info: { case: 'bpm', value: bpm },
        }),
      );
    }
  };

  const setFirstBeatMs = (ms: number) => {
    const t = BigInt(Math.max(0, Math.round(ms)));
    if (firstBeatKeyframe) {
      firstBeatKeyframe.t = t;
    } else {
      track.beatKeyframes.push(
        create(Track_BeatKeyframeSchema, {
          t,
          info: { case: 'beat', value: 0 },
        }),
      );
    }
  };

  const beatConverters = useMemo(
    () => (wasmReady ? getTrackBeatConverters(track) : null),
    [wasmReady, track, bpm, firstBeatMs],
  );

  useEffect(() => {
    return listenToTick(() => {
      const timeMs = getCurrentTimeMs(trackId);
      if (timeIndicatorRef.current) {
        timeIndicatorRef.current.textContent =
          timeMs != null ? `${Math.round(timeMs)}ms` : '—';
      }
      if (beatIndicatorRef.current) {
        beatIndicatorRef.current.textContent =
          timeMs != null && beatConverters
            ? beatConverters.msToBeat(timeMs).toFixed(2)
            : '—';
      }
    });
  }, [trackId, beatConverters]);

  const waveformQuery = useWaveform(track);

  useEffect(() => {
    setViewEnd(Number(waveformQuery.data?.durationMs) || null);
  }, [waveformQuery.data?.durationMs]);

  return (
    <div>
      <div className={styles.header}>
        <IconButton
          title="jog back"
          disabled={!loaded}
          onClick={() => jog(trackId, -JOG_MS)}
        >
          <BiRewind />
        </IconButton>
        <IconButton
          title={playing ? 'pause' : 'play'}
          disabled={!loaded}
          onClick={() => (playing ? pause(trackId) : play(trackId))}
        >
          {playing ? <BiPause /> : <BiPlay />}
        </IconButton>
        <IconButton
          title="reset"
          disabled={!loaded}
          onClick={() => seek(trackId, 0)}
        >
          <BiReset />
        </IconButton>
        <IconButton
          title="jog forward"
          disabled={!loaded}
          onClick={() => jog(trackId, JOG_MS)}
        >
          <BiFastForward />
        </IconButton>
        <Spacer />
        <div className={styles.playbackMetric}>
          Time: <span ref={timeIndicatorRef}>—</span>
        </div>
        <div className={styles.playbackMetric}>
          Beat: <span ref={beatIndicatorRef}>—</span>
        </div>
      </div>
      {waveformQuery.isSuccess && viewEnd !== null ? (
        <Waveform
          className={styles.waveform}
          waveformData={waveformQuery.data}
          startMs={viewStart}
          endMs={viewEnd}
          msToBeat={beatConverters?.msToBeat}
          beatToMs={beatConverters?.beatToMs}
          onViewChange={(startMs, endMs) => {
            setViewStart(startMs);
            setViewEnd(endMs);
          }}
          onSeek={(timeMs) => seek(trackId, timeMs)}
          playing={playing}
          getPlayheadMs={() => getCurrentTimeMs(trackId)}
        />
      ) : (
        <div className={styles.waveform}>Loading...</div>
      )}
      <div className={styles.beatControls}>
        <label>
          BPM{' '}
          <NumberInput
            mode="bpm"
            value={bpm}
            onChange={setBpm}
            onFinalize={(v) =>
              save(`Set BPM to ${v} for track '${track.name}'.`)
            }
          />
        </label>
        <label>
          First beat{' '}
          <NumberInput
            mode="milliseconds"
            value={firstBeatMs}
            onChange={setFirstBeatMs}
            onFinalize={(v) =>
              save(`Set first beat to ${v}ms for track '${track.name}'.`)
            }
          />
        </label>
      </div>
      <div className={styles.metadata}>
        <div>Original filename: {track.originalFileName}</div>
        <div>Filetype: {track.mime}</div>
      </div>
    </div>
  );
}
