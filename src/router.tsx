import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router';

import Index from './Index';
import { AboutPage } from './pages/AboutPage';
import AssetBrowserPage from './pages/AssetBrowserPage';
import { AutopilotPage } from './pages/AutopilotPage';
import { ControllerPage } from './pages/ControllerPage';
import { LivePage } from './pages/LivePage';
import ProjectPage from './pages/ProjectPage';
import { TimecodedPage } from './pages/TimecodedPage';
import { patchRoutes } from './pages/patch/PatchPage';

const LAST_PATH_KEY = 'dmx.lastPath';

export const initialPath = (() => {
  try {
    return localStorage.getItem(LAST_PATH_KEY) ?? '/';
  } catch {
    return '/';
  }
})();

export function PersistLocation() {
  const location = useLocation();
  useEffect(() => {
    try {
      localStorage.setItem(LAST_PATH_KEY, location.pathname + location.search);
    } catch {
      // Ignore storage failures (e.g. private mode); resume is best-effort.
    }
  }, [location]);
  return null;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Index />}>
        <Route index element={<LivePage />} />
        <Route path="live" element={<LivePage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="assets" element={<AssetBrowserPage />} />
        <Route path="autopilot" element={<AutopilotPage />} />
        <Route path="controller" element={<ControllerPage />} />
        <Route path="project" element={<ProjectPage />} />
        <Route path="timecoded" element={<TimecodedPage />} />
        {patchRoutes}
      </Route>
    </Routes>
  );
}
