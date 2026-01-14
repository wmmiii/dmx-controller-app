import { create } from '@bufbuild/protobuf';
import { JSX, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { TimecodedEffect } from '@dmx-controller/proto/effect_pb';
import { Project } from '@dmx-controller/proto/project_pb';
import {
  ShowSchema,
  Show_AudioTrackSchema,
  Show_OutputSchema,
} from '@dmx-controller/proto/show_pb';
import { Button } from '../components/Button';
import { TextInput } from '../components/Input';
import LightTimeline, {
  LightTimelineEffect,
} from '../components/LightTimeline';
import { Modal } from '../components/Modal';
import { PaletteContext } from '../contexts/PaletteContext';
import { ProjectContext } from '../contexts/ProjectContext';
import { ShortcutContext } from '../contexts/ShortcutContext';
import { DEFAULT_COLOR_PALETTE } from '../util/colorUtil';
import { UNSET_INDEX, idMapToArray } from '../util/mapUtils';
import { randomUint64 } from '../util/numberUtils';
import styles from './ShowPage.module.scss';

function createShow(project: Project) {
  const audioFiles = Object.keys(project.assets?.audioFiles || {});
  if (audioFiles.length == 0) {
    throw new Error('Tried to create show without audio file!');
  }

  const id = randomUint64();
  project.shows[id.toString()] = create(ShowSchema, {
    name: 'Untitled Show',
    audioTrack: {
      audioFileId: BigInt(audioFiles[0]),
    },
    outputs: [
      {
        collapsed: false,
        layers: [],
      },
    ],
  });
  return id;
}

export default function ShowPage(): JSX.Element {
  const { project, save } = useContext(ProjectContext);
  const { setShortcuts } = useContext(ShortcutContext);

  let t = useRef<number>(0);
  const [audioDuration, setAudioDuration] = useState(1);
  const [beatSubdivisions, setBeatSubdivisions] = useState(1);

  const [showDetailsModal, setShowDetailsModal] = useState(false);

  const [selectedEffect, setSelectedEffect] =
    useState<LightTimelineEffect | null>(null);
  const [copyEffect, setCopyEffect] = useState<TimecodedEffect | null>(null);

  const show = useMemo(
    () => project?.shows[project.selectedShow.toString()],
    [project],
  );

  useEffect(
    () =>
      setShortcuts([
        {
          shortcut: { key: 'Escape' },
          action: () => setSelectedEffect(null),
          description: 'Deselect the currently selected effect.',
        },
        {
          shortcut: { key: 'KeyC', modifiers: ['ctrl'] },
          action: () => setCopyEffect(selectedEffect?.effect || null),
          description: 'Copy currently selected effect to clipboard.',
        },
      ]),
    [setSelectedEffect, setCopyEffect, selectedEffect],
  );

  const audioFile = useMemo(() => {
    if (show?.audioTrack?.audioFileId != null) {
      return project?.assets?.audioFiles[
        show?.audioTrack.audioFileId.toString()
      ];
    } else {
      return undefined;
    }
  }, [show?.audioTrack?.audioFileId, project]);

  const audioBlob = useMemo(() => {
    if (!audioFile) {
      return undefined;
    }
    return new Blob([audioFile.contents], {
      type: audioFile.mime,
    });
  }, [audioFile]);

  const beatMetadata = audioFile?.beatMetadata;

  if (project?.shows == null || Object.entries(project.shows).length === 0) {
    if (Object.keys(project?.assets || {}).length === 0) {
      return (
        <p>
          Please <a href="/assets">upload an audio asset</a> before creating a
          show!
        </p>
      );
    } else {
      return (
        <>
          <Button
            onClick={() => {
              project.selectedShow = createShow(project);
              save('Create default show.');
            }}
          >
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
    <PaletteContext.Provider
      value={{
        palette: show.colorPalette || DEFAULT_COLOR_PALETTE,
      }}
    >
      <LightTimeline
        audioBlob={audioBlob}
        audioDuration={audioDuration}
        setAudioDuration={setAudioDuration}
        selectedEffect={selectedEffect}
        setSelectedEffect={setSelectedEffect}
        copyEffect={copyEffect}
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
                  createShow(project);
                } else {
                  project.selectedShow = BigInt(e.target.value);
                }
                save(
                  `Set selected show to ${project.shows[project.selectedShow.toString()].name}.`,
                );
              }}
              value={project.selectedShow.toString() || '0'}
            >
              {Object.entries(project?.shows || {}).map(([id, s]) => (
                <option key={id} value={id}>
                  {s.name}
                </option>
              ))}
              <option value={-1}>+ Create New Show</option>
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
                show.audioTrack = create(Show_AudioTrackSchema, {
                  audioFileId: BigInt(e.target.value),
                });
                save(`Set audio track for show ${show.name}.`);
              }}
              value={show?.audioTrack?.audioFileId.toString()}
            >
              <option value={UNSET_INDEX}>&lt;Unset&gt;</option>
              {idMapToArray(project?.assets?.audioFiles).map(([id, f]) => (
                <option key={id} value={id}>
                  {f.name}
                </option>
              ))}
            </select>
          </>
        }
        outputs={show.outputs}
        swap={(a, b) => {
          const temp = show.outputs[a];
          show.outputs[a] = show.outputs[b];
          show.outputs[b] = temp;
        }}
        addLayer={() => {
          show.outputs.push(create(Show_OutputSchema, {}));
          save(`Add layer to show ${show.name}.`);
        }}
        t={t}
      />
      {showDetailsModal && (
        <Modal
          title={show?.name + ' Metadata'}
          onClose={() => setShowDetailsModal(false)}
        >
          <div className={styles.detailsModal}>
            <div>
              Title:&nbsp;
              <TextInput
                value={show?.name}
                onChange={(v) => {
                  show.name = v;
                  save(`Change show name to ${show.name}.`);
                }}
              />
            </div>
            <div>
              <Button
                variant="warning"
                onClick={() => {
                  delete project.shows[project.selectedShow.toString()];
                  project.selectedShow = BigInt(Object.keys(project.shows)[0]);
                  save(`Delete show ${show.name}.`);
                  setShowDetailsModal(false);
                }}
              >
                Delete Show
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </PaletteContext.Provider>
  );
}
