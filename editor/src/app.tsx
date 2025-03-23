import { StrictMode } from 'react';
import Index from './Index';
import { BrowserRouter } from 'react-router-dom';
import { DialogProvider } from './contexts/DialogContext';
import { ProjectProvider } from './contexts/ProjectContext';
import { SerialProvider } from './contexts/SerialContext';
import { ShortcutProvider } from './contexts/ShortcutContext';
import { TimeProvider } from './contexts/TimeContext';
import { createRoot } from 'react-dom/client';
import { ControllerProvider } from './contexts/ControllerContext';

// import wasm, {hello_world} from '@dmx-controller/core_interface/core_wasm';

// wasm("core_wasm_bg.wasm").then(() => {
//   console.log(hello_world());
// });

const root = createRoot(document.getElementById('root')!);
root.render(
  <StrictMode>
    <BrowserRouter basename="/">
      <TimeProvider>
        <DialogProvider>
          <SerialProvider>
            <ShortcutProvider>
              <ProjectProvider>
                <ControllerProvider>
                  <Index />
                </ControllerProvider>
              </ProjectProvider>
            </ShortcutProvider>
          </SerialProvider>
        </DialogProvider>
      </TimeProvider>
    </BrowserRouter>
  </StrictMode>
);
