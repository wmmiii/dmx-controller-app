import { JSX, createRef, useContext, useEffect, useState } from 'react';
import { Route, Routes, useNavigate } from 'react-router';

import {
  BiBulb,
  BiDownload,
  BiLink,
  BiLogoGithub,
  BiLogoWindows,
  BiMenu,
  BiSolidBulb,
  BiUnlink,
  BiUpload,
} from 'react-icons/bi';
import styles from './Index.module.scss';
import { Button, ControllerButton } from './components/Button';
import { DmxUniverseVisualizer } from './components/DmxUniverseVisualizer';
import { Dropdown } from './components/Dropdown';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Modal } from './components/Modal';
import { Spacer } from './components/Spacer';
import { WledVisualizer } from './components/WledVisualizer';
import { ControllerContext } from './contexts/ControllerContext';
import { DialogContext } from './contexts/DialogContext';
import { ProjectContext } from './contexts/ProjectContext';
import { SerialContext } from './contexts/SerialContext';
import AssetBrowserPage from './pages/AssetBrowserPage';
import { LivePage } from './pages/LivePage';
import ProjectPage from './pages/ProjectPage';
import ShowPage from './pages/ShowPage';
import PatchPage from './pages/patch/PatchPage';
import { getActivePatch } from './util/projectUtils';

export default function Index(): JSX.Element {
  const { port, blackout, setBlackout, connect, disconnect } =
    useContext(SerialContext);
  const { controllerName, connect: connectMidi } =
    useContext(ControllerContext);
  const { project, downloadProject, openProject, lastOperation } =
    useContext(ProjectContext);
  const navigate = useNavigate();

  const [showMenu, setShowMenu] = useState(false);
  const uploadButtonRef = createRef<HTMLInputElement>();

  useEffect(() => {
    if (uploadButtonRef.current) {
      const button = uploadButtonRef.current;
      const handleUpload = async () => {
        if (button?.files == null) {
          throw new Error('Cannot find input button files!');
        }
        const file = button.files[0];
        const body = new Uint8Array(await file.arrayBuffer());
        openProject(body);
      };
      button.addEventListener('change', handleUpload);
      return () => button.removeEventListener('change', handleUpload);
    }
    return undefined;
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
          }}
        >
          <BiMenu className={styles.menuIcon} />
          {showMenu && (
            <Dropdown onClose={() => setShowMenu(false)}>
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
                  title: 'Patch',
                  onSelect: () => navigate('/patch'),
                },
                {
                  title: 'Project Settings',
                  onSelect: () => navigate('/project'),
                },
                { type: 'separator' },
                {
                  title: 'Download',
                  icon: <BiDownload />,
                  onSelect: downloadProject,
                },
                {
                  title: 'Upload',
                  icon: <BiUpload />,
                  onSelect: () => uploadButtonRef.current?.click(),
                },
                { type: 'separator' },
                {
                  title: 'Connect to serial',
                  icon: port ? <BiLink /> : <BiUnlink />,
                  onSelect: () => (port ? disconnect() : connect()),
                },
                {
                  title: 'Toggle Blackout',
                  icon: blackout ? <BiBulb /> : <BiSolidBulb />,
                  onSelect: () => setBlackout(!blackout),
                },
                { type: 'separator' },
                {
                  title: 'GitHub Page',
                  icon: <BiLogoGithub />,
                  onSelect: () =>
                    window.open(
                      'https://github.com/wmmiii/dmx-controller-app/',
                      '_blank',
                    ),
                },
              ]}
            </Dropdown>
          )}
        </div>
        {Object.entries(getActivePatch(project).outputs).map(
          ([outputId, output], i) => {
            switch (output.output.case) {
              case 'serialDmxOutput':
                return (
                  <DmxUniverseVisualizer
                    key={i}
                    dmxOutputId={BigInt(outputId)}
                  />
                );
              case 'wledOutput':
                return (
                  <WledVisualizer key={i} wledOutputId={BigInt(outputId)} />
                );
              default:
                return null;
            }
          },
        )}
        <Spacer />
        <div className={styles.message}>{lastOperation}</div>
        <FpsIndicator />
        <ControllerButton
          title="Midi Controller"
          iconOnly={true}
          midiState={controllerName ? 'active' : 'inactive'}
          onClick={connectMidi}
        />
      </header>
      <main>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<LivePage />} />
            <Route path="/live" element={<LivePage />} />
            <Route path="/show" element={<ShowPage />} />
            <Route path="/assets" element={<AssetBrowserPage />} />
            <Route path="/patch" element={<PatchPage />} />
            <Route path="/project" element={<ProjectPage />} />
          </Routes>
        </ErrorBoundary>
      </main>
    </div>
  );
}

function FpsIndicator() {
  const { subscribeToFspUpdates } = useContext(SerialContext);
  const [fps, setFps] = useState(0);

  useEffect(() => {
    subscribeToFspUpdates(setFps);
  }, [subscribeToFspUpdates, setFps]);

  return (
    <div className={styles.fps}>
      Fps:{' '}
      {Number.isNaN(fps) ? (
        <>N/A</>
      ) : fps < 30 ? (
        <span className={styles.warning}>{fps}</span>
      ) : (
        <>{fps}</>
      )}
    </div>
  );
}

const WARNING_DIALOG_KEY = 'instability-warning';

function WarningDialog() {
  const dialogContext = useContext(DialogContext);
  const [open, setOpen] = useState(
    !dialogContext.isDismissed(WARNING_DIALOG_KEY),
  );

  if (!open) {
    return null;
  }

  return (
    <Modal
      bodyClass={styles.welcomeDialog}
      title="Welcome! 😊"
      onClose={() => setOpen(false)}
      footer={
        <div className={styles.buttonRow}>
          <Button
            variant="warning"
            onClick={() => {
              dialogContext.setDismissed(WARNING_DIALOG_KEY);
              setOpen(false);
            }}
          >
            Don't show this dialog again
          </Button>
          <Button variant="primary" onClick={() => setOpen(false)}>
            Let's go!
          </Button>
        </div>
      }
    >
      <p>
        This app attempts to provide an experimental playground for easily
        creating and playing DMX (And now WLED!) lighting performances! All the
        features have been thrown together with haste so there are plenty of
        bugs and engineer-UI everywhere.
      </p>
      <p>
        To contribute to the project or report any issues please open an issue
        on the&nbsp;
        <a
          href="https://github.com/wmmiii/dmx-controller-app/issues"
          target="_blank"
        >
          project's GitHub page
        </a>
        . Thanks!
      </p>
      <h3>⚠️ Warning</h3>
      <p>
        This web-app is currently in development and there is a&nbsp;
        <strong>significant risk of data-loss</strong>!
        <br />
        <br />
        Use at your own risk!
      </p>
      {navigator.userAgent.toLowerCase().indexOf('win') > -1 && (
        <>
          <h3>
            <BiLogoWindows /> Windows Users
          </h3>
          <p>
            You may need to install{' '}
            <a
              href="https://www.silabs.com/developer-tools/usb-to-uart-bridge-vcp-drivers?tab=downloads"
              target="_blank"
            >
              additional drivers
            </a>{' '}
            such that serial UART devices can be recognized by your operating
            system.
          </p>
        </>
      )}
      <p></p>
    </Modal>
  );
}
