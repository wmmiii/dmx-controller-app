import { JSX, createRef, useContext, useEffect, useState } from 'react';
import { Route, Routes, useNavigate } from 'react-router';

import '@radix-ui/themes/styles.css';
import { exit } from '@tauri-apps/plugin-process';
import {
  BiDownload,
  BiError,
  BiLink,
  BiLogoGithub,
  BiMenu,
  BiUnlink,
  BiUpload,
} from 'react-icons/bi';
import styles from './Index.module.css';
import { Button, ControllerButton } from './components/Button';
import { DmxUniverseVisualizer } from './components/DmxUniverseVisualizer';
import { Dropdown } from './components/Dropdown';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Modal } from './components/Modal';
import { Spacer } from './components/Spacer';
import { WledVisualizer } from './components/WledVisualizer';
import { ControllerContext } from './contexts/ControllerContext';
import { ProjectContext } from './contexts/ProjectContext';
import { SerialContext } from './contexts/SerialContext';
import AssetBrowserPage from './pages/AssetBrowserPage';
import { ControllerPage } from './pages/ControllerPage';
import { LivePage } from './pages/LivePage';
import ProjectPage from './pages/ProjectPage';
import ShowPage from './pages/ShowPage';
import PatchPage from './pages/patch/PatchPage';
import { dismissDialog, isDialogDismissed } from './util/dialogUtil';
import { getActivePatch } from './util/projectUtils';

export default function Index(): JSX.Element {
  const { port, connect, disconnect } = useContext(SerialContext);
  const { connectedDevices, connect: connectMidi } =
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
      <header data-tauri-drag-region>
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
            <Dropdown
              onClose={() => setShowMenu(false)}
              items={[
                {
                  title: 'Live',
                  onSelect: () => navigate('/live'),
                },
                // {
                //   title: 'Show',
                //   onSelect: () => navigate('/show'),
                // },
                // {
                //   title: 'Assets',
                //   onSelect: () => navigate('/assets'),
                // },
                {
                  title: 'Patch',
                  onSelect: () => navigate('/patch'),
                },
                {
                  title: 'MIDI',
                  onSelect: () => navigate('/controller'),
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
                {
                  type: 'separator' as const, // Type-madness.
                },
                {
                  title: 'Exit',
                  onSelect: async () => {
                    try {
                      await exit(0);
                    } catch (e) {
                      console.error(e);
                    }
                  },
                },
              ]}
            />
          )}
        </div>
        {Object.entries(getActivePatch(project).outputs)
          .filter(([_, output]) => output.enabled)
          .map(([outputId, output], i) => {
            switch (output.output.case) {
              case 'sacnDmxOutput':
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
          })}
        <Spacer />
        <div className={styles.message}>{lastOperation}</div>
        <ControllerButton
          title="Midi Controller"
          iconOnly={true}
          midiState={connectedDevices.length > 0 ? 'active' : 'inactive'}
          onClick={connectMidi}
        />
      </header>
      <main>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<LivePage />} />
            <Route path="/assets" element={<AssetBrowserPage />} />
            <Route path="/controller" element={<ControllerPage />} />
            <Route path="/live" element={<LivePage />} />
            <Route path="/patch" element={<PatchPage />} />
            <Route path="/project" element={<ProjectPage />} />
            <Route path="/show" element={<ShowPage />} />
          </Routes>
        </ErrorBoundary>
      </main>
    </div>
  );
}

const WARNING_DIALOG_KEY = 'welcome-warning';

function WarningDialog() {
  const { project, save } = useContext(ProjectContext);
  const [open, setOpen] = useState(
    !isDialogDismissed(project, WARNING_DIALOG_KEY),
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
        <>
          <Button variant="primary" onClick={() => setOpen(false)}>
            Let's go!
          </Button>
          <Button
            variant="warning"
            onClick={() => {
              dismissDialog(project, WARNING_DIALOG_KEY);
              save('Dismiss welcome dialog.');
              setOpen(false);
            }}
          >
            Don't show this dialog again
          </Button>
        </>
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
      <h3>
        <BiError />
        Warning
      </h3>
      <p>
        This app is currently in development and there is a&nbsp;
        <strong>significant risk of data-loss</strong>!
        <br />
        <br />
        Use at your own risk!
      </p>
    </Modal>
  );
}
