import React, { JSX, useContext, useEffect, useMemo, useRef, useState } from 'react';

import styles from "./ShowPage.module.scss";
import { Button } from '../components/Button';
import { LightTrack as LightTrackProto } from '@dmx-controller/proto/light_track_pb';
import { Modal } from '../components/Modal';
import { ProjectContext } from '../contexts/ProjectContext';
import { SerialContext } from '../contexts/SerialContext';
import { Show, Show_AudioTrack } from '@dmx-controller/proto/show_pb';
import { UNSET_INDEX, idMapToArray } from '../util/mapUtils';
import { renderShowToUniverse } from '../engine/universe';
import { TextInput } from '../components/Input';
import LightTimeline from '../components/LightTimeline';

const DEFAULT_SHOW = new Show({
  name: 'Untitled Show',
  audioTrack: {
    audioFileId: UNSET_INDEX + 1,
  },
  lightTracks: [
    {
      name: 'Fixture',
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

export default function showPage(): JSX.Element {
  const { project, save } = useContext(ProjectContext);
  const { setRenderUniverse, clearRenderUniverse } = useContext(SerialContext);

  let t = useRef<number>(0);

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

  if (show == null) {
    return (
      <>Loading...</>
    );
  }

  return (
    <>
      <LightTimeline
        audioBlob={audioBlob}
        beatMetadata={beatMetadata}
        headerOptions={
          <>
            Show:
            <br />
            <select
              onChange={(e) => {
                if (e.target.value === '-1') {
                  project.shows.push(DEFAULT_SHOW);
                  project.selectedShow = project.shows.length - 1;
                  save();
                } else {
                  project.selectedShow = parseInt(e.target.value);
                  save();
                }
              }}
              value={project?.selectedShow || 0}>
              {
                project?.shows.map((s: Show, i: number) => (
                  <option value={i}>{s.name}</option>
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
                save();
              }}
              value={show?.audioTrack.audioFileId}>
              <option value={UNSET_INDEX}>
                &lt;Unset&gt;
              </option>
              {
                idMapToArray(project?.assets?.audioFiles)
                  .map(([id, f]) => (
                    <option value={id}>
                      {f.name}
                    </option>
                  ))
              }
            </select>
          </>
        }
        lightTracks={show.lightTracks}
        save={save}
        swap={(a, b) => {
          const temp = show.lightTracks[a];
          show.lightTracks[a] = show.lightTracks[b];
          show.lightTracks[b] = temp;
        }}
        addLayer={() => {
          show?.lightTracks.push(new LightTrackProto({
            name: 'Layer ' + (show.lightTracks.length + 1),
          }));
          save();
        }}
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
                  save();
                }} />
            </div>
            <div>
              <Button
                variant='warning'
                onClick={() => {
                  project.shows.splice(project.selectedShow, 1);
                  project.selectedShow = 0;
                  save();
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
