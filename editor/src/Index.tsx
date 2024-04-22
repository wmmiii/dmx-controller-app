import React, { JSX, createRef, useContext, useEffect } from 'react';

import AssetBrowserPage from './pages/AssetBrowserPage';
import IconBxBulb from './icons/IconBxBulb';
import IconBxLink from './icons/IconBxLink';
import IconBxUnlink from './icons/IconBxUnlink';
import IconBxsBulb from './icons/IconBxsBulb';
import ShowPage from './pages/ShowPage';
import { IconButton } from './components/Button';
import { Link } from 'react-router-dom';
import { Routes, Route } from 'react-router-dom';
import { SerialContext } from './contexts/SerialContext';

import styles from './Index.module.scss';
import IconBxDownload from './icons/IconBxDownload';
import { ProjectContext } from './contexts/ProjectContext';
import IconBxUpload from './icons/IconBxUpload';

export default function Index(): JSX.Element {
  const { port, blackout, setBlackout, connect, disconnect, currentFps } = useContext(SerialContext);
  const { downloadProject, openProject } = useContext(ProjectContext);

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
        <Link to="/assets">Assets</Link>
        <div className={styles.spacer}></div>
        <div>
          Fps: {currentFps}
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
          <Route path="/assets" element={<AssetBrowserPage />} />
        </Routes>
      </main>
    </div>
  );
}
