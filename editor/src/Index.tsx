import React, { JSX } from 'react';

import styles from "./Index.module.scss";
import AssetBrowser from './pages/AssetBrowser';
import { Routes, Route } from 'react-router-dom';
import Sandbox from './pages/Sandbox';
import { Link } from 'react-router-dom';

export default function Index(): JSX.Element {
  return (
    <div className={styles.wrapper}>
      <header>
        <Link to="/">Sandbox</Link>
        <Link to="/assets">Assets</Link>
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
