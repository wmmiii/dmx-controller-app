import { invoke } from '@tauri-apps/api/core';
import { useContext, useState } from 'react';
import { Browser } from '../components/Browser';
import { Button } from '../components/Button';
import { ProjectContext } from '../contexts/ProjectContext';
import styles from './AssetBrowserPage.module.css';

export default function AssetBrowserPage() {
  const { project, save } = useContext(ProjectContext);
  const [selectedId, setSelectedId] = useState<bigint | null>(null);

  return (
    <Browser
      className={styles.foo}
      items={Object.entries(project.audioFiles).map(([id, audioFile]) => ({
        name: audioFile.name,
        setName: (name) => {
          const oldName = audioFile.name;
          audioFile.name = oldName;
          save(`Rename audio file '${oldName}' to '${name}'.`);
        },
        selected: BigInt(id) === selectedId,
        onSelect: () => setSelectedId(BigInt(id)),
      }))}
      listHeader={
        <Button
          onClick={async () => {
            const id = await invoke<string>('import_audio_file');
            console.log(id);
            if (id != null) {
              setSelectedId(BigInt(id));
            }
          }}
        >
          Add audio file
        </Button>
      }
      emptyPlaceholder="Select an audio file to edit."
    >
      {null}
    </Browser>
  );
}
