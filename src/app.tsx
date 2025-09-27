import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import Index from './Index';
import { BeatProvider } from './contexts/BeatContext';
import { ControllerProvider } from './contexts/ControllerContext';
import { DialogProvider } from './contexts/DialogContext';
import { ProjectProvider } from './contexts/ProjectContext';
import { RenderingProvider } from './contexts/RenderingContext';
import { SerialProvider } from './contexts/SerialContext';
import { ShortcutProvider } from './contexts/ShortcutContext';
import { TimeProvider } from './contexts/TimeContext';
import { WledRendererProvider } from './contexts/WledRendererContext';

// import wasm, {hello_world} from '@dmx-controller/core_interface/core_wasm';

// wasm("core_wasm_bg.wasm").then(() => {
//   console.log(hello_world());
// });

const root = createRoot(document.getElementById('root')!);
root.render(
  <StrictMode>
    <BrowserRouter basename="/">
      <TimeProvider>
        <RenderingProvider>
          <DialogProvider>
            <ShortcutProvider>
              <ProjectProvider>
                <SerialProvider>
                  <BeatProvider>
                    <ControllerProvider>
                      <WledRendererProvider>
                        <Index />
                      </WledRendererProvider>
                    </ControllerProvider>
                  </BeatProvider>
                </SerialProvider>
              </ProjectProvider>
            </ShortcutProvider>
          </DialogProvider>
        </RenderingProvider>
      </TimeProvider>
    </BrowserRouter>
  </StrictMode>,
);
