import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import Index from './Index';
import { BeatProvider } from './contexts/BeatContext';
import { ControllerProvider } from './contexts/ControllerContext';
import { ProjectProvider } from './contexts/ProjectContext';
import { SerialProvider } from './contexts/SerialContext';
import { ShortcutProvider } from './contexts/ShortcutContext';
import './vars.css';

const root = createRoot(document.getElementById('root')!);
root.render(
  <StrictMode>
    <BrowserRouter basename="/">
      <ShortcutProvider>
        <ProjectProvider>
          <SerialProvider>
            <BeatProvider>
              <ControllerProvider>
                <Index />
              </ControllerProvider>
            </BeatProvider>
          </SerialProvider>
        </ProjectProvider>
      </ShortcutProvider>
    </BrowserRouter>
  </StrictMode>,
);
