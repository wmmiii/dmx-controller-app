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
import { Button } from './components/Button';
import { useNavigate } from 'react-router-dom';
import { ProjectContext } from './contexts/ProjectContext';
import { Routes, Route } from 'react-router-dom';
import { SerialContext } from './contexts/SerialContext';
import { LivePage } from './pages/LivePage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DialogContext } from './contexts/DialogContext';
import { Modal } from './components/Modal';
import IconBxError from './icons/IconBxError';
import IconBxlGithub from './icons/IconBxlGithub';
import { UniverseVisualizer } from './components/UniverseVisualizer';
import IconBxlWindows from './icons/IconBxlWindows';
import IconBxMenu from './icons/IconBxMenu';
import { Dropdown } from './components/Dropdown';
import ProjectPage from './pages/ProjectPage';

export default function Index(): JSX.Element {
  const { port, blackout, setBlackout, connect, disconnect } = useContext(SerialContext);
  const { downloadProject, openProject, lastOperation } = useContext(ProjectContext);
  const navigate = useNavigate();

  const [showMenu, setShowMenu] = useState(false);
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
        <h1>DMX Controller App</h1>
        <input ref={uploadButtonRef} type="file" hidden></input>
        <div
          className={styles.menu}
          onClick={(e) => {
            setShowMenu(!showMenu);
            e.stopPropagation();
          }}>
          <IconBxMenu className={styles.menuIcon} />
          {
            showMenu &&
            <Dropdown
              onClose={() => setShowMenu(false)}>
              {[
                {
                  title: 'Live',
                  onSelect: () => navigate('/live'),
                },
                {
                  title: 'Show',
                  onSelect: () => navigate('/show'),
                },
                {
                  title: 'Assets',
                  onSelect: () => navigate('/assets'),
                },
                {
                  title: 'Sequence Editor',
                  onSelect: () => navigate('/sequence'),
                },
                {
                  title: 'Universe',
                  onSelect: () => navigate('/universe'),
                },
                {
                  title: 'Project Settings',
                  onSelect: () => navigate('/project'),
                },
                { type: 'separator' },
                {
                  title: 'Download',
                  icon: <IconBxDownload />,
                  onSelect: downloadProject,
                },
                {
                  title: 'Upload',
                  icon: <IconBxUpload />,
                  onSelect: () => uploadButtonRef.current?.click(),
                },
                { type: 'separator' },
                {
                  title: 'Connect to serial',
                  icon: port ? <IconBxLink /> : <IconBxUnlink />,
                  onSelect: () => port ? disconnect() : connect(),
                },
                {
                  title: 'Toggle Blackout',
                  icon: blackout ? <IconBxBulb /> : <IconBxsBulb />,
                  onSelect: () => setBlackout(!blackout),
                },
                { type: 'separator' },
                {
                  title: 'GitHub Page',
                  icon: <IconBxlGithub />,
                  onSelect: () => window.open('https://github.com/wmmiii/dmx-controller-app/', '_blank'),
                }
              ]}
            </Dropdown>
          }
        </div>
        <UniverseVisualizer />
        <div className={styles.spacer}></div>
        <div className={styles.message}>
          {lastOperation}
        </div>
        <FpsIndicator />
      </header >
      <main>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<LivePage />} />
            <Route path="/live" element={<LivePage />} />
            <Route path="/show" element={<ShowPage />} />
            <Route path="/assets" element={<AssetBrowserPage />} />
            <Route path="/sequence" element={<SequencePage />} />
            <Route path="/universe" element={<UniversePage />} />
            <Route path="/project" element={<ProjectPage />} />
          </Routes>
        </ErrorBoundary>
      </main>
    </div >
  );
}

function FpsIndicator() {
  const {subscribeToFspUpdates} = useContext(SerialContext);
  const [fps, setFps] = useState(0);

  useEffect(() => {
    subscribeToFspUpdates(setFps);
  }, [subscribeToFspUpdates, setFps]);

  return (
    <div className={styles.fps}>
      Fps: {
        Number.isNaN(fps) ?
          <>N/A</> :
          fps < 30 ?
            <span className={styles.warning}>
              {fps}
            </span> :
            <>{fps}</>
      }
    </div>
  );
}

interface PageLinkProps {
  to: string;
  default?: true;
  children: string;
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
      bodyClass={styles.welcomeDialog}
      title="Welcome!"
      onClose={() => setOpen(false)}
      footer={
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
      }>
      <p>
        This app attempts to provide an experimental playground for easily
        creating and playing DMX lighting performances! All the features have
        been thrown together with haste so there are plenty of bugs and
        engineer-UI everywhere.
      </p>
      <p>
        To contribute to the project or report any issues please open an issue
        on the&nbsp;
        <a
          href="https://github.com/wmmiii/dmx-controller-app/issues"
          target="_blank">
          project's GitHub page</a>. Thanks!
      </p>
      <h3><IconBxError />&nbsp;Warning</h3>
      <p>
        This web-app is currently in development and there is a&nbsp;
        <strong>significant risk of data-loss</strong>!
        <br />
        <br />
        Use at your own risk!
      </p>
      {
        navigator.userAgent.toLowerCase().indexOf('win') > -1 &&
        <>
          <h3><IconBxlWindows /> Windows Users</h3>
          <p>
            You may need to install <a
              href="https://www.silabs.com/developer-tools/usb-to-uart-bridge-vcp-drivers?tab=downloads"
              target="_blank">
              additional drivers
            </a> such that serial UART devices can be recognized by your
            operating system.
          </p>
        </>
      }
      <p></p>
    </Modal>
  );
}
