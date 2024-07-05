import React from 'react';
import { createRoot } from 'react-dom/client';
import Index from './Index';
import { ProjectProvider } from './contexts/ProjectContext';
import { BrowserRouter } from 'react-router-dom';
import { SerialProvider } from './contexts/SerialContext';
import { ShortcutProvider } from './contexts/ShortcutContext';

// import wasm, {hello_world} from '@dmx-controller/core_interface/core_wasm';

// wasm("core_wasm_bg.wasm").then(() => {
//   console.log(hello_world());
// });

const root = createRoot(document.getElementById('root'));
root.render(
  <BrowserRouter basename="/">
    <ProjectProvider>
      <SerialProvider>
        <ShortcutProvider>
          <Index />
        </ShortcutProvider>
      </SerialProvider>
    </ProjectProvider>
  </BrowserRouter>
);
