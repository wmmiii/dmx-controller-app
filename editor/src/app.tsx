import React from 'react';
import * as ReactDOM from 'react-dom';
import Index from './Index';

// import wasm, {hello_world} from '@dmx-controller/core_interface/core_wasm';

// wasm("core_wasm_bg.wasm").then(() => {
//   console.log(hello_world());
// });

ReactDOM.render(
  <Index />,
  document.getElementById('root')
);
