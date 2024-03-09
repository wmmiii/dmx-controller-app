import React, { JSX, useContext } from 'react';

import AssetBrowserPage from './pages/AssetBrowserPage';
import IconBxBulb from './icons/IconBxBulb';
import IconBxLink from './icons/IconBxLink';
import IconBxUnlink from './icons/IconBxUnlink';
import IconBxsBulb from './icons/IconBxsBulb';
import SandboxPage from './pages/SandboxPage';
import ShowPage from './pages/ShowPage';
import { IconButton } from './components/Button';
import { Link } from 'react-router-dom';
import { Routes, Route } from 'react-router-dom';
import { SerialContext } from './contexts/SerialContext';

import styles from './Index.module.scss';

export default function Index(): JSX.Element {
  const { port, blackout, setBlackout, connect, disconnect } = useContext(SerialContext);

  return (
    <div className={styles.wrapper}>
      <header>
        <Link to="/">Sandbox</Link>
        <Link to="/show">Show</Link>
        <Link to="/assets">Assets</Link>
        <div className={styles.spacer}></div>
        <IconButton onClick={() => setBlackout(!blackout)}>
          {blackout ? <IconBxBulb /> : <IconBxsBulb />}
        </IconButton>
        <IconButton onClick={() => {
          if (port) {
            disconnect();
          } else {
            connect();
          }
        }}>
          {port ? <IconBxLink /> : <IconBxUnlink />}
        </IconButton>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<SandboxPage />} />
          <Route path="/show" element={<ShowPage />} />
          <Route path="/assets" element={<AssetBrowserPage />} />
        </Routes>
      </main>
    </div>
  );
}
