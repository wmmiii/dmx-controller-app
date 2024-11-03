import React, { StrictMode } from 'react';
import Index from './Index';
import { BrowserRouter } from 'react-router-dom';
import { DialogProvider } from './contexts/DialogContext';
import { ProjectProvider } from './contexts/ProjectContext';
import { SerialProvider } from './contexts/SerialContext';
import { ShortcutProvider } from './contexts/ShortcutContext';
import { createRoot } from 'react-dom/client';

// import wasm, {hello_world} from '@dmx-controller/core_interface/core_wasm';

// wasm("core_wasm_bg.wasm").then(() => {
//   console.log(hello_world());
// });

const root = createRoot(document.getElementById('root'));
root.render(
  <StrictMode>
    <BrowserRouter basename="/">
      <DialogProvider>
        <SerialProvider>
          <ShortcutProvider>
            <ProjectProvider>
              <Index />
            </ProjectProvider>
          </ShortcutProvider>
        </SerialProvider>
      </DialogProvider>
    </BrowserRouter>
  </StrictMode>
);
