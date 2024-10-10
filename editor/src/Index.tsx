import React, { JSX, createRef, useContext, useEffect, useState } from 'react';

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
import { Button, IconButton } from './components/Button';
import { Link, useLocation } from 'react-router-dom';
import { ProjectContext } from './contexts/ProjectContext';
import { Routes, Route } from 'react-router-dom';
import { SerialContext } from './contexts/SerialContext';
import { NumberInput } from './components/Input';
import { LivePage } from './pages/LivePage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DialogContext } from './contexts/DialogContext';
import { Modal } from './components/Modal';

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
      <WarningDialog />
      <header>
        <PageLink to="/show" default={true}>Show</PageLink>
        <PageLink to="/live">Live</PageLink>
        <PageLink to="/assets">Assets</PageLink>
        <PageLink to="/sequence">Sequence</PageLink>
        <PageLink to="/universe">Universe</PageLink>
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
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<ShowPage />} />
            <Route path="/show" element={<ShowPage />} />
            <Route path="/live" element={<LivePage />} />
            <Route path="/assets" element={<AssetBrowserPage />} />
            <Route path="/sequence" element={<SequencePage />} />
            <Route path="/universe" element={<UniversePage />} />
          </Routes>
        </ErrorBoundary>
      </main>
    </div>
  );
}

interface PageLinkProps {
  to: string;
  default?: true;
  children: string;
}

function PageLink(props: PageLinkProps) {
  const location = useLocation();
  let className: string | undefined;
  if (location.pathname === props.to ||
      (location.pathname === '/' && props.default)) {
    className = styles.active;
  }
  return (
    <Link to={props.to} className={className}>
      {props.children}
    </Link>
  );
}

const WARNING_DIALOG_KEY = 'instability-warning';

function WarningDialog() {
  const dialogContext = useContext(DialogContext);
  const [open, setOpen] =
      useState(!dialogContext.isDismissed(WARNING_DIALOG_KEY));

  if (!open) {
    return null;
  }

  return (
    <Modal
      title="Warning!"
      onClose={() => setOpen(false)}>
      <p>
        This web-app is currently in development and there is a&nbsp;
        <strong>significant risk of data-loss</strong>!
      </p>
      <p>
        Use at your own risk!
      </p>
      <div className={styles.buttonRow}>
        <Button
            variant='warning'
            onClick={() => {
              dialogContext.setDismissed(WARNING_DIALOG_KEY);
              setOpen(false);
            }}>
              Don't show this dialog again
        </Button>
        <Button
            variant='primary'
            onClick={() => setOpen(false)}>
              Close
        </Button>
      </div>
    </Modal>
  );
}
