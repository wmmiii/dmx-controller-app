import React, { JSX, createRef, useContext, useEffect } from 'react';

import AssetBrowserPage from './pages/AssetBrowserPage';
import IconBxBulb from './icons/IconBxBulb';
import IconBxDownload from './icons/IconBxDownload';
import IconBxLink from './icons/IconBxLink';
import IconBxUnlink from './icons/IconBxUnlink';
import IconBxUpload from './icons/IconBxUpload';
import IconBxsBulb from './icons/IconBxsBulb';
import SequencePage from './pages/SequencePage';
import ShowPage from './pages/ShowPage';
import UniversePage from './pages/UniversePage';
import styles from './Index.module.scss';
import { IconButton } from './components/Button';
import { Link } from 'react-router-dom';
import { ProjectContext } from './contexts/ProjectContext';
import { Routes, Route } from 'react-router-dom';
import { SerialContext } from './contexts/SerialContext';
import { NumberInput } from './components/Input';
import { LivePage } from './pages/LivePage';

export default function Index(): JSX.Element {
  const { port, blackout, setBlackout, connect, disconnect, currentFps } = useContext(SerialContext);
  const { downloadProject, openProject, project, save } = useContext(ProjectContext);

  const uploadButtonRef = createRef<HTMLInputElement>();

  useEffect(() => {
    if (uploadButtonRef.current) {
      const button = uploadButtonRef.current;
      const handleUpload = async () => {
        const file = button.files[0];
        const body = new Uint8Array(await file.arrayBuffer())
        openProject(body);
      };
      button.addEventListener('change', handleUpload);
      return () => button.removeEventListener('change', handleUpload);
    }
  }, [uploadButtonRef.current]);

  return (
    <div className={styles.wrapper}>
      <header>
        <Link to="/show">Show</Link>
        <Link to="/live">Live</Link>
        <Link to="/assets">Assets</Link>
        <Link to="/sequence">Sequence</Link>
        <Link to="/universe">Universe</Link>
        <div className={styles.spacer}></div>
        <div>
          Fps: {
            currentFps < 30 ?
              <span className={styles.warning}>
                {currentFps}
              </span> :
              <>{currentFps}</>
          }
        </div>
        <div>
          Offset MS:
          <NumberInput
            min={-1000}
            max={1000}
            value={project?.timingOffsetMs || 0}
            onChange={(v) => {
              if (project) {
                project.timingOffsetMs = v;
                save();
              }
            }} />
        </div>
        <IconButton title="Blackout" onClick={() => setBlackout(!blackout)}>
          {blackout ? <IconBxBulb /> : <IconBxsBulb />}
        </IconButton>
        <IconButton title="Connect to serial" onClick={() => {
          if (port) {
            disconnect();
          } else {
            connect();
          }
        }}>
          {port ? <IconBxLink /> : <IconBxUnlink />}
        </IconButton>
        <IconButton title="Download" onClick={downloadProject}>
          <IconBxDownload />
        </IconButton>
        <input ref={uploadButtonRef} type="file" hidden></input>
        <IconButton
          title="Upload"
          onClick={() => uploadButtonRef.current?.click()}>
          <IconBxUpload />
        </IconButton>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<ShowPage />} />
          <Route path="/show" element={<ShowPage />} />
          <Route path="/live" element={<LivePage />} />
          <Route path="/assets" element={<AssetBrowserPage />} />
          <Route path="/sequence" element={<SequencePage />} />
          <Route path="/universe" element={<UniversePage />} />
        </Routes>
      </main>
    </div>
  );
}
