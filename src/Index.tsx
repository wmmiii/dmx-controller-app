import { exit } from '@tauri-apps/plugin-process';
import clsx from 'clsx';
import { JSX, useContext, useState } from 'react';
import {
  BiDownload,
  BiFile,
  BiInfoCircle,
  BiMenu,
  BiUpload,
} from 'react-icons/bi';
import { Route, Routes, useNavigate } from 'react-router';

import styles from './Index.module.css';
import { Button, ControllerButton, IconButton } from './components/Button';
import { DisplayVisualizer } from './components/DisplayVisualizer';
import { DmxUniverseVisualizer } from './components/DmxUniverseVisualizer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Modal } from './components/Modal';
import { Popover } from './components/Popover';
import { Spacer } from './components/Spacer';
import { WledVisualizer } from './components/WledVisualizer';
import { ControllerContext } from './contexts/ControllerContext';
import { ProjectContext } from './contexts/ProjectContext';
import { AboutPage } from './pages/AboutPage';
import AssetBrowserPage from './pages/AssetBrowserPage';
import { ControllerPage } from './pages/ControllerPage';
import { LivePage } from './pages/LivePage';
import ProjectPage from './pages/ProjectPage';
import { ShowPage } from './pages/ShowPage';
import PatchPage from './pages/patch/PatchPage';
import { getActivePatch } from './util/projectUtils';

export default function Index(): JSX.Element {
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
      title: 'About',
      icon: <BiInfoCircle />,
      onSelect: () => navigate('/about'),
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
          .sort(([_a, a], [_b, b]) => a.name.localeCompare(b.name))
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
              // DDP outputs don't render directly - they consume virtual displays
              case 'ddpOutput':
              default:
                return null;
            }
          })}
        <DisplayVisualizer />
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
            <Route path="/about" element={<AboutPage />} />
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
