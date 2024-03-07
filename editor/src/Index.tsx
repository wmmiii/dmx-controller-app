import React, { JSX, useContext } from 'react';

import styles from "./Index.module.scss";
import AssetBrowser from './pages/AssetBrowser';
import { Routes, Route } from 'react-router-dom';
import Sandbox from './pages/Sandbox';
import { Link } from 'react-router-dom';
import { IconButton } from './components/IconButton';
import IconBxLink from './icons/IconBxLink';
import IconBxUnlink from './icons/IconBxUnlink';
import { SerialContext } from './contexts/SerialContext';

export default function Index(): JSX.Element {
  const { port, connect, disconnect } = useContext(SerialContext);

  return (
    <div className={styles.wrapper}>
      <header>
        <Link to="/">Sandbox</Link>
        <Link to="/assets">Assets</Link>
        <div className={styles.spacer}></div>
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
          <Route path="/" element={<Sandbox />} />
          <Route path="/assets" element={<AssetBrowser />} />
        </Routes>
      </main>
    </div>
  );
}
