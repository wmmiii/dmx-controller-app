import { JSX, useContext, useState } from 'react';
import { Route, Routes, useNavigate } from 'react-router';

import { exit } from '@tauri-apps/plugin-process';
import clsx from 'clsx';
import {
  BiDownload,
  BiError,
  BiFile,
  BiHappyBeaming,
  BiLink,
  BiLogoGithub,
  BiMenu,
  BiUnlink,
  BiUpload,
} from 'react-icons/bi';
import styles from './Index.module.css';
import { Button, ControllerButton, IconButton } from './components/Button';
import { DmxUniverseVisualizer } from './components/DmxUniverseVisualizer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Modal } from './components/Modal';
import { Popover } from './components/Popover';
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
  const { project, downloadProject, openProject, newProject, lastOperation } =
    useContext(ProjectContext);
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);

  const menuItems = [
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
      title: 'New Project',
      icon: <BiFile />,
      onSelect: () => setShowNewProjectDialog(true),
    },
    {
      title: 'Save As',
      icon: <BiDownload />,
      onSelect: downloadProject,
    },
    {
      title: 'Open',
      icon: <BiUpload />,
      onSelect: openProject,
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
        window.open('https://github.com/wmmiii/dmx-controller-app/', '_blank'),
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
  ];

  return (
    <div className={styles.wrapper}>
      <WarningDialog />
      {showNewProjectDialog && (
        <Modal
          title="New Project"
          onClose={() => setShowNewProjectDialog(false)}
          bodyClass={styles.newProject}
          footer={
            <>
              <Button onClick={() => setShowNewProjectDialog(false)}>
                Cancel
              </Button>
              <Button
                variant="warning"
                onClick={async () => {
                  await newProject();
                  setShowNewProjectDialog(false);
                }}
              >
                Don't save
              </Button>
              <Button
                variant="primary"
                onClick={async () => {
                  await downloadProject();
                  await newProject();
                  setShowNewProjectDialog(false);
                }}
              >
                Save first
              </Button>
            </>
          }
        >
          <p>
            Would you like to save your current project before creating a new
            one? Any unsaved changes will be lost.
          </p>
        </Modal>
      )}
      <header data-tauri-drag-region>
        <h1>DMX Controller App</h1>
        <Popover
          open={menuOpen}
          onOpenChange={setMenuOpen}
          arrow={false}
          className={styles.dropdown}
          popover={
            <>
              {menuItems.map((item, index) => {
                if (item.type === 'separator') {
                  return <hr key={index} />;
                }
                return (
                  <button
                    key={index}
                    className={styles.item}
                    onClick={() => {
                      item.onSelect?.();
                      setMenuOpen(false);
                    }}
                  >
                    <div className={styles.icon}>{item.icon}</div>
                    {item.title}
                  </button>
                );
              })}
            </>
          }
        >
          <IconButton
            className={clsx(styles.menu, { [styles.open]: menuOpen })}
            title="menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <BiMenu />
          </IconButton>
        </Popover>
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
      title={
        <>
          <BiHappyBeaming /> Welcome!
        </>
      }
      onClose={() => setOpen(false)}
      footer={
        <>
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
          <Button variant="primary" onClick={() => setOpen(false)}>
            Let's go!
          </Button>
        </>
      }
    >
      <p>
        Welcome to DMX Controller App! Create and perform live lighting shows
        with DMX and WLED devices. Whether you're lighting a stage, a party, or
        just experimenting, this app makes it easy to get started.
      </p>
      <p>
        New here? Check out the&nbsp;
        <a href="https://dmx-controller.app" target="_blank">
          getting started guide
        </a>
        . Have feedback or found a bug? Open an issue on the&nbsp;
        <a
          href="https://github.com/wmmiii/dmx-controller-app/issues"
          target="_blank"
        >
          GitHub page
        </a>
        —contributions are always welcome!
      </p>
      <h3>
        <BiError />
        Warning
      </h3>
      <p>
        This app is in active development. Updates may introduce&nbsp;
        <strong>breaking changes</strong> that make your existing projects
        incompatible. Use at your own risk!
      </p>
    </Modal>
  );
}
