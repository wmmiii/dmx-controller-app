import { AudioFile } from '@dmx-controller/proto/audio_pb';
import { Project_Assets } from '@dmx-controller/proto/project_pb';
import { JSX, useContext, useState } from 'react';

import { BeatEditor } from '../components/BeatEditor';
import { Button } from '../components/Button';
import { HorizontalSplitPane } from '../components/SplitPane';
import { ProjectContext } from '../contexts/ProjectContext';
import { idMapToArray, nextId } from '../util/mapUtils';
import { formatBytes } from '../util/numberUtils';

import styles from './AssetBrowserPage.module.scss';

export default function AssetBrowserPage(): JSX.Element {
  const [selectedAudio, setSelectedAudio] = useState<AudioFile | null>(null);

  return (
    <div className={styles.browser}>
      <HorizontalSplitPane
        className={styles.splitPane}
        left={<AudioFileList selectAudioFile={setSelectedAudio} />}
        right={<AudioDetails file={selectedAudio} />}
      />
    </div>
  );
}

interface AudioFileListProps {
  selectAudioFile: (f: AudioFile) => void;
}

function AudioFileList({
  selectAudioFile,
}: AudioFileListProps): JSX.Element | null {
  const { project, saveAssets } = useContext(ProjectContext);
  const [highlightDrop, setHighlightDrop] = useState(false);

  const classes = [styles.audioFileList];
  if (highlightDrop) {
    classes.push(styles.highlightDrop);
  }

  return (
    <div
      className={classes.join(' ')}
      onDragOver={(e) => {
        setHighlightDrop(true);
        e.preventDefault();
        e.stopPropagation();
      }}
      onDragLeave={(e) => {
        setHighlightDrop(false);
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();

        (async () => {
          for (let i = 0; i < e.dataTransfer.items.length; ++i) {
            const item = e.dataTransfer.items[i];
            if (item.kind === 'file') {
              const file = item.getAsFile() as File;
              if (file.type.startsWith('audio/')) {
                const audioFile = new AudioFile({
                  name: file.name,
                  contents: new Uint8Array(await file.arrayBuffer()),
                  mime: file.type,
                });

                if (!project.assets) {
                  project.assets = new Project_Assets();
                }

                const newId = nextId(project.assets.audioFiles);
                project.assets.audioFiles[newId] = audioFile;
              }
            }
          }

          saveAssets();
        })();

        setHighlightDrop(false);
      }}
    >
      <ol>
        {idMapToArray(project.assets?.audioFiles).map(([id, f]) => (
          <li key={id} onClick={() => selectAudioFile(f)}>
            {f.name}
          </li>
        ))}
        {Object.keys(project.assets?.audioFiles || {}).length < 1 && (
          <li>No items</li>
        )}
      </ol>
      <p className={styles.faint}>
        Drag audio files onto pane to add to project.
      </p>
    </div>
  );
}

interface AudioDetailsProps {
  file: AudioFile | null;
}

function AudioDetails({ file }: AudioDetailsProps): JSX.Element {
  const [beatFile, setBeatFile] = useState<AudioFile | null>(null);

  if (!file) {
    return (
      <div className={styles.audioDetails}>
        Select audio file to view details.
      </div>
    );
  }
  return (
    <div className={styles.audioDetails}>
      Name: {file.name}
      <br />
      Size: {formatBytes(file.contents.length)}
      <br />
      Type: {file.mime}
      <br />
      <Button onClick={() => setBeatFile(file)}>Edit Beat</Button>
      {beatFile && (
        <BeatEditor file={file} onCancel={() => setBeatFile(null)} />
      )}
    </div>
  );
}
