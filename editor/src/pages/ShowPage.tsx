import React, { JSX, useContext, useEffect, useMemo, useRef, useState } from 'react';

import LightTimeline from '../components/LightTimeline';
import styles from "./ShowPage.module.scss";
import { Button } from '../components/Button';
import { LightTrack as LightTrackProto } from '@dmx-controller/proto/light_track_pb';
import { Modal } from '../components/Modal';
import { ProjectContext } from '../contexts/ProjectContext';
import { SerialContext } from '../contexts/SerialContext';
import { Show, Show_AudioTrack } from '@dmx-controller/proto/show_pb';
import { TextInput } from '../components/Input';
import { UNSET_INDEX, idMapToArray } from '../util/mapUtils';
import { renderShowToUniverse } from '../engine/universe';

const DEFAULT_SHOW = new Show({
  name: 'Untitled Show',
  audioTrack: {
    audioFileId: UNSET_INDEX + 1,
  },
  lightTracks: [
    {
      output: {
        value: 0,
        case: 'physicalFixtureId',
      },
      layers: [
        {
          effects: [],
        }
      ]
    },
  ],
});

export default function ShowPage(): JSX.Element {
  const { project, save } = useContext(ProjectContext);
  const { setRenderUniverse, clearRenderUniverse } = useContext(SerialContext);

  const panelRef = useRef<HTMLDivElement>();

  let t = useRef<number>(0);
  const [audioDuration, setAudioDuration] = useState(1);
  const [beatSubdivisions, setBeatSubdivisions] = useState(1);

  const [showDetailsModal, setShowDetailsModal] = useState(false);

  const show =
    useMemo(() => project?.shows[project.selectedShow || 0], [project]);

  useEffect(() => {
    if (!project) {
      return;
    }

    const render = () => renderShowToUniverse(t.current, project);
    setRenderUniverse(render);

    return () => clearRenderUniverse(render);
  }, [project, t]);

  const audioFile = useMemo(
    () => project?.assets?.audioFiles[show?.audioTrack.audioFileId],
    [show?.audioTrack.audioFileId, project]);
  const audioBlob = useMemo(() => {
    if (!audioFile) {
      return undefined;
    }
    return new Blob([audioFile.contents], {
      type: audioFile.mime,
    });
  }, [audioFile]);

  const beatMetadata = audioFile?.beatMetadata;

  if (project?.shows == null || (project.shows?.length || 0) === 0) {
    if (Object.keys(project?.assets || {}).length === 0) {
      return (
        <p>
          Please <a href="/assets">upload an audio asset</a> before creating a
          show!
        </p>
      )
    } else {
      return (
        <>
          <Button onClick={() => {
            project.shows = [DEFAULT_SHOW];
            save('Create default show.');
          }}>
            Create a show!
          </Button>       
        </>
      );
    }
  }

  if (!show) {
    return <>Loading...</>;
  }

  return (
    <>
      <LightTimeline
        audioBlob={audioBlob}
        audioDuration={audioDuration}
        setAudioDuration={setAudioDuration}
        beatMetadata={beatMetadata}
        beatSubdivisions={beatSubdivisions}
        setBeatSubdivisions={setBeatSubdivisions}
        headerOptions={
          <>
            Show:
            <br />
            <select
              onChange={(e) => {
                if (e.target.value === '-1') {
                  project.shows.push(DEFAULT_SHOW);
                  project.selectedShow = project.shows.length - 1;
                } else {
                  project.selectedShow = parseInt(e.target.value);
                }
                save(`Set selected show to ${project.shows[project.selectedShow].name}.`);
              }}
              value={project?.selectedShow || 0}>
              {
                project?.shows.map((s: Show, i: number) => (
                  <option key={i} value={i}>{s.name}</option>
                ))
              }
              <option value={-1}>
                + Create New Show
              </option>
            </select>
          </>
        }
        leftOptions={
          <>
            <Button onClick={() => setShowDetailsModal(true)}>
              Show Details
            </Button>
            Audio Track:
            <br />
            <select
              onChange={(e) => {
                show.audioTrack = new Show_AudioTrack({
                  audioFileId: parseInt(e.target.value),
                });
                save(`Set audio track for show ${show.name}.`);
              }}
              value={show?.audioTrack.audioFileId}>
              <option value={UNSET_INDEX}>
                &lt;Unset&gt;
              </option>
              {
                idMapToArray(project?.assets?.audioFiles)
                  .map(([id, f]) => (
                    <option key={id} value={id}>
                      {f.name}
                    </option>
                  ))
              }
            </select>
          </>
        }
        lightTracks={show.lightTracks}
        swap={(a, b) => {
          const temp = show.lightTracks[a];
          show.lightTracks[a] = show.lightTracks[b];
          show.lightTracks[b] = temp;
        }}
        addLayer={() => {
          show?.lightTracks.push(new LightTrackProto());
          save(`Add layer to show ${show.name}.`);
        }}
        panelRef={panelRef}
        t={t} />
      {
        showDetailsModal &&
        <Modal
          title={show?.name + ' Metadata'}
          onClose={() => setShowDetailsModal(false)}>
          <div className={styles.detailsModal}>
            <div>
              Title:&nbsp;
              <TextInput
                value={show?.name}
                onChange={(v) => {
                  show.name = v;
                  save(`Change show name to ${show.name}.`);
                }} />
            </div>
            <div>
              <Button
                variant='warning'
                onClick={() => {
                  project.shows.splice(project.selectedShow, 1);
                  project.selectedShow = 0;
                  save(`Delete show ${show.name}.`);
                  setShowDetailsModal(false);
                }}>
                Delete Show
              </Button>&nbsp;
              Cannot be undone!
            </div>
          </div>
        </Modal>
      }
    </>
  );
}
