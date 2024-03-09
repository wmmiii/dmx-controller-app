import { AudioFile, AudioFile_BeatMetadata } from "@dmx-controller/proto/audio_pb";
import { Modal } from "./Modal";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import SpectrogramPlugin from "wavesurfer.js/dist/plugins/spectrogram.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.js";
import { Button } from "./Button";
import IconBxZoomIn from "../icons/IconBxZoomin";
import IconBxZoomOut from "../icons/IconBxZoomOut";
import IconBxPulse from "../icons/IconBxPulse";

import styles from './BeatEditor.module.scss';
import IconBxPause from "../icons/IconBxPause";
import IconBxPlay from "../icons/IconBxPlay";
import IconBxSkipPrevious from "../icons/IconBxSkipPrevious";
import IconBxSkipNext from "../icons/IconBxSkipNext";
import { WAVEFORM_COLOR, WAVEFORM_CURSOR_COLOR, WAVEFORM_PROGRESS_COLOR } from "../util/styleUtils";

interface BeatEditorProps {
  file: AudioFile;
  onCancel: () => void;
  onSave: () => void;
}

export function BeatEditor({ file, onCancel, onSave }: BeatEditorProps):
  JSX.Element {
  const waveRef = useRef<HTMLDivElement>();
  const [zoomLevel, setZoomLevel] = useState(64);
  const [waveSurfer, setWaveSurfer] = useState<WaveSurfer | null>(null);
  const [waveSurferRegions, setWaveSurferRegions] =
    useState<RegionsPlugin | null>(null);
  const [firstMarker, setFirstMarker] =
    useState<number>(file.beatMetadata?.offsetMs || 1000);
  const [secondMarker, setSecondMarker] = useState<number>(
    (file.beatMetadata?.offsetMs || 1000) +
    (file.beatMetadata?.lengthMs || 1000));
  const [lastMarker, setLastMarker] = useState<number>(
    (file.beatMetadata?.offsetMs || 1000) +
    (file.beatMetadata?.lengthMs || 1000) * 2);
  const [beatsPerDuration, setBeatsPerDuration] = useState(1);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);

  const segmentDuration = useMemo(() => {
    const totalDuration = lastMarker - firstMarker;
    const firstMarkerDuration = secondMarker - firstMarker;
    const actualNumSegments = totalDuration / firstMarkerDuration;

    const minSegmentDuration = totalDuration / Math.floor(actualNumSegments);
    const maxSegmentDuration = totalDuration / Math.ceil(actualNumSegments);

    if (Math.abs(minSegmentDuration - firstMarkerDuration) <
      Math.abs(maxSegmentDuration - firstMarkerDuration)) {
      return minSegmentDuration;
    } else {
      return maxSegmentDuration;
    }
  }, [firstMarker, secondMarker, lastMarker]);

  const calculatedFirstMarker = useMemo(
    () => firstMarker % segmentDuration,
    [firstMarker, segmentDuration]);

  const beatDuration = segmentDuration / beatsPerDuration;
  const firstBeat = firstMarker % beatDuration;

  const fileBlob = useMemo(
    () => {
      return new Blob([file.contents], {
        type: file.mime,
      });
    },
    [file]);

  useEffect(() => {
    if (waveRef.current != null && fileBlob != null) {
      const ws = WaveSurfer.create({
        container: waveRef.current,
        waveColor: WAVEFORM_COLOR,
        cursorColor: WAVEFORM_CURSOR_COLOR,
        progressColor: WAVEFORM_PROGRESS_COLOR,
        sampleRate: 22050,
      });

      ws.on('click', (seconds) => ws.seekTo(seconds));
      ws.on('audioprocess', (seconds: number) => setT(seconds * 1000));
      ws.on('play', () => setPlaying(true));
      ws.on('pause', () => setPlaying(false));

      ws.registerPlugin(SpectrogramPlugin.create({
        height: 100,
      }));

      setWaveSurferRegions(ws.registerPlugin(RegionsPlugin.create()));

      ws.loadBlob(fileBlob)
        .then(() => {
          const first =
            (file.beatMetadata?.offsetMs || 1000);
          const second =
            (file.beatMetadata?.offsetMs || 1000) +
            (file.beatMetadata?.lengthMs || 1000);
          const beatLength = second - first;
          const duration = ws.getDuration() * 1000;

          const numBeats = Math.floor((duration - first) / beatLength);
          const lastBeat = first + beatLength * numBeats;

          setLastMarker(lastBeat * 1000);
        })
        .then(() => setWaveSurfer(ws));

      return () => {
        setWaveSurfer(null);
        ws.destroy();
      }
    }
  }, [waveRef.current, fileBlob]);

  // Set zoom level.
  useEffect(() => waveSurfer?.zoom(zoomLevel), [waveSurfer, zoomLevel]);

  // Draw markers.
  useEffect(() => {
    if (!!waveSurfer && !!waveSurferRegions) {
      waveSurferRegions.clearRegions();

      waveSurferRegions.addRegion({
        id: 'first-marker',
        start: firstMarker / 1000,
        content: 'First marker',
        color: '#FFFFFF',
      });

      waveSurferRegions.addRegion({
        id: 'second-marker',
        start: secondMarker / 1000,
        content: 'Second marker',
        color: '#FFFFFF',
      });

      waveSurferRegions.addRegion({
        id: 'last-marker',
        start: lastMarker / 1000,
        content: 'Last marker',
        color: 'rgba(255, 255, 255, 0.5)',
      });

      for (
        let t = calculatedFirstMarker / 1000;
        t < waveSurfer.getDuration();
        t += (segmentDuration / 1000)
      ) {
        waveSurferRegions.addRegion({
          start: t,
          color: 'rgba(255, 255, 255, 0.1)',
          drag: false,
        });
      }

      for (
        let t = firstBeat / 1000;
        t < waveSurfer.getDuration();
        t += (beatDuration / 1000)
      ) {
        waveSurferRegions.addRegion({
          start: t,
          color: 'rgba(255, 255, 255, 0.1)',
          drag: false,
        });
      }

      return waveSurferRegions.on('region-updated', (region) => {
        const markers = [firstMarker, secondMarker, lastMarker];
        switch (region.id) {
          case 'first-marker':
            markers[0] = Math.floor(region.start * 1000);
            break;
          case 'second-marker':
            markers[1] = Math.floor(region.start * 1000);
            break;
          case 'last-marker':
            markers[2] = Math.floor(region.start * 1000);
            break;
        }
        markers.sort((a, b) => a - b);
        setFirstMarker(markers[0]);
        setSecondMarker(markers[1]);
        setLastMarker(markers[2]);
      });
    }
  }, [waveSurfer, waveSurferRegions, firstMarker, secondMarker, lastMarker, beatsPerDuration]);

  const playPause = useCallback(() => {
    if (waveSurfer) {
      waveSurfer.playPause();
    }
  }, [waveSurfer]);

  const beat = ((t - firstBeat) % beatDuration) / beatDuration;

  const save = useCallback(() => {
    file.beatMetadata = new AudioFile_BeatMetadata({
      lengthMs: beatDuration,
      offsetMs: Math.floor(firstBeat),
    });
    onSave();
  }, [file, beatDuration, firstBeat]);

  return (
    <Modal
      title="Beat Editor"
      onClose={() => onCancel()}
      footer={
        <div className={styles.buttonRow}>
          <Button variant="default" onClick={onCancel}>Close</Button>
          <Button variant="primary" onClick={save}>Save</Button>
        </div>
      }>
      <div className={styles.buttonRow}>
        <Button
          icon={<IconBxZoomIn />}
          onClick={() => setZoomLevel(zoomLevel * 2)}>
          Zoom In
        </Button>
        <div
          className={styles.beatIndicator}
          style={{ opacity: 1 - beat }}
          title="Beat Indicator">
          <IconBxPulse />
        </div>
        <Button
          icon={<IconBxZoomOut />}
          onClick={() => setZoomLevel(zoomLevel / 2)}>
          Zoom Out
        </Button>
      </div>
      <div ref={waveRef}></div>
      <div className={styles.buttonRow}>
        <Button
          onClick={() => waveSurfer.seekTo(0)}
          icon={<IconBxSkipPrevious />}>
          Jump to start
        </Button>
        <Button
          onClick={playPause}
          icon={
            playing ?
              <IconBxPause /> :
              <IconBxPlay />
          }>
          {playing ? 'Pause' : 'Play'}
        </Button>
        <Button
          onClick={() => waveSurfer.seekTo(1)}
          icon={<IconBxSkipNext />}>
          Jump to end
        </Button>
      </div>
      <div className={styles.buttonRow}>
        <div>
          Beats per segment:&nbsp;
          <input
            type="number"
            step="1"
            value={beatsPerDuration}
            onChange={(e) => setBeatsPerDuration(parseInt(e.target.value))} />
        </div>
      </div>
      <h2>Instructions</h2>
      <ol>
        <li>
          Find a pattern that you can easily identify in the audio file. This
          could be a beat or a measure of the track.
        </li>
        <li>
          Drag the "First marker" line exactly at the first easily
          identifiable instance of the pattern.
          <ul>
            <li>
              This does not need to be the first instance but should be as
              early in the track as possible.
            </li>
            <li>
              <strong>Tip:</strong> Use the "Zoom In" and "Zoom Out" buttons to
              place the markers as closely as possible on the waveform.
            </li>
          </ul>
        </li>
        <li>
          Drag the "Second marker" line to the end of the pattern marked by the
          "First marker" line such that there is exactly one pattern segment
          between the "First marker" and the "Second marker".
        </li>
        <li>
          Seek to the end of the track and drag the "Last marker" line to the
          last easily identifiable start of the pattern.
          <ul>
            <li>
              This does not need to be the last instance but should be as late
              in the track as possible.
            </li>
          </ul>
        </li>
        <li>
          Specify how many beats are in each pattern segment in the "Beats per
          segment" field.
          <ul>
            <li>
              If the pattern describes the beat this can be left at "1".
            </li>
            <li>
              If the pattern describes a measure of a 4/4 song then the "Beats
              per segment" field should be set to 4.
            </li>
          </ul>
        </li>
        <li>
          Play the audio track and verify that the beat indicator (above the
          track) flashes correctly to the beat.
          <ul>
            <li>
              <strong>Warning:</strong> The beat indicator may lag behind the
              audio slightly. This is okay and will be corrected for when
              outputting your light show.
            </li>
          </ul>
        </li>
      </ol>
    </Modal>
  );
}