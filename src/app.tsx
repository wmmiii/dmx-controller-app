import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import Index from './Index';
import { BeatProvider } from './contexts/BeatContext';
import { ControllerProvider } from './contexts/ControllerContext';
import { DialogProvider } from './contexts/DialogContext';
import { ProjectProvider } from './contexts/ProjectContext';
import { SacnRendererProvider } from './contexts/SacnRendererContext';
import { SerialProvider } from './contexts/SerialContext';
import { ShortcutProvider } from './contexts/ShortcutContext';
import { WledRendererProvider } from './contexts/WledRendererContext';

const root = createRoot(document.getElementById('root')!);
root.render(
  <StrictMode>
    <BrowserRouter basename="/">
      <DialogProvider>
        <ShortcutProvider>
          <ProjectProvider>
            <SerialProvider>
              <BeatProvider>
                <ControllerProvider>
                  <SacnRendererProvider>
                    <WledRendererProvider>
                      <Index />
                    </WledRendererProvider>
                  </SacnRendererProvider>
                </ControllerProvider>
              </BeatProvider>
            </SerialProvider>
          </ProjectProvider>
        </ShortcutProvider>
      </DialogProvider>
    </BrowserRouter>
  </StrictMode>,
);
