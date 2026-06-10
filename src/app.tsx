import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import Index from './Index';
import { AudioInputProvider } from './contexts/AudioInputContext';
import { BeatProvider } from './contexts/BeatContext';
import { ControllerProvider } from './contexts/ControllerContext';
import { ProjectProvider } from './contexts/ProjectContext';
import { ShortcutProvider } from './contexts/ShortcutContext';
import './vars.css';

if (/iPad|iPhone|iPod|Mac/.test(navigator.userAgent)) {
  document.body.classList.add('apple');
} else if (/Windows/.test(navigator.userAgent)) {
  document.body.classList.add('windows');
}

const root = createRoot(document.getElementById('root')!);
root.render(
  <StrictMode>
    <BrowserRouter basename="/">
      <ShortcutProvider>
        <ProjectProvider>
          <BeatProvider>
            <AudioInputProvider>
              <ControllerProvider>
                <Index />
              </ControllerProvider>
            </AudioInputProvider>
          </BeatProvider>
        </ProjectProvider>
      </ShortcutProvider>
    </BrowserRouter>
  </StrictMode>,
);
