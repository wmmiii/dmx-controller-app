import React from 'react';
import * as ReactDOM from 'react-dom';
import Index from './Index';
import { ProjectProvider } from './contexts/ProjectContext';
import { BrowserRouter } from 'react-router-dom';
import { SerialProvider } from './contexts/SerialContext';

// import wasm, {hello_world} from '@dmx-controller/core_interface/core_wasm';

// wasm("core_wasm_bg.wasm").then(() => {
//   console.log(hello_world());
// });

ReactDOM.render(
  <BrowserRouter basename="/">
    <ProjectProvider>
      <SerialProvider>
        <Index />
      </SerialProvider>
    </ProjectProvider>
  </BrowserRouter>,
  document.getElementById('root')
);
