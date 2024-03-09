import React, { useContext, useState } from 'react';
import styles from './AssetBrowserPage.module.scss';
import { AudioFile } from '@dmx-controller/proto/audio_pb';
import { BeatEditor } from '../components/BeatEditor';
import { Button } from '../components/Button';
import { HorizontalSplitPane } from '../components/SplitPane';
import { ProjectContext } from '../contexts/ProjectContext';
import { Project_Assets } from '@dmx-controller/proto/project_pb';
import { formatBytes } from '../util/numberUtils';

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

function AudioFileList({ selectAudioFile }: AudioFileListProps): JSX.Element {
  const { project, saveProject } = useContext(ProjectContext);
  const [highlightDrop, setHighlightDrop] = useState(false);

  if (!project) {
    return null;
  }

  const classes = [styles.audioFileList];
  if (highlightDrop) {
    classes.push(styles.highlightDrop);
  }

  return (
    <ol
      className={styles.audioFileList}
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
          for (const item of e.dataTransfer.items) {
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
                project.assets.audioFiles.push(audioFile);
              }
            }
          }

          saveProject(project);
        })();

        setHighlightDrop(false);
      }}>
      {
        project.assets?.audioFiles.map((f, i) => (
          <li key={i} onClick={() => selectAudioFile(f)}>
            {f.name}
          </li>
        ))
      }
      {
        (project.assets?.audioFiles.length || 0) < 1 &&
        <li>No items</li>
      }
    </ol>
  );
}

interface AudioDetailsProps {
  file: AudioFile | null;
}

function AudioDetails({ file }: AudioDetailsProps): JSX.Element {
  const { project, saveProject } = useContext(ProjectContext);
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
      Name: {file.name}<br />
      Size: {formatBytes(file.contents.length)}<br />
      Type: {file.mime}<br />
      <Button onClick={() =>
        setBeatFile(file)}>
        Edit Beat
      </Button>
      {
        beatFile &&
        <BeatEditor
          file={file}
          onCancel={() => setBeatFile(null)}
          onSave={() => {
            saveProject(project);
            setBeatFile(null);
          }} />
      }
    </div>
  );
}
