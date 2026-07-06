import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import Index from './Index';
import { preloadWasm } from './wasm/engine';

import { Clickwrap } from './components/Clickwrap';
import { AudioInputProvider } from './contexts/AudioInputContext';
import { BeatProvider } from './contexts/BeatContext';
import { ClipboardProvider } from './contexts/ClipboardContext';
import { ControllerProvider } from './contexts/ControllerContext';
import { ProjectProvider } from './contexts/ProjectContext';
import { ShortcutProvider } from './contexts/ShortcutContext';
import { installExternalLinkHandler } from './util/browserUtils';
import './vars.css';

// BigInt has no built-in JSON representation; patch toJSON so that any
// JSON.stringify call (React internals, useMemo deps, etc.) converts bigints
// to strings instead of throwing "cannot serialize BigInt".
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

preloadWasm();
installExternalLinkHandler();

if (/iPad|iPhone|iPod|Mac/.test(navigator.userAgent)) {
  document.body.classList.add('apple');
} else if (/Windows/.test(navigator.userAgent)) {
  document.body.classList.add('windows');
}

const root = createRoot(document.getElementById('root')!);
root.render(
  <StrictMode>
    <Clickwrap>
      <BrowserRouter basename="/">
        <ShortcutProvider>
          <ProjectProvider>
            <ClipboardProvider>
              <BeatProvider>
                <AudioInputProvider>
                  <ControllerProvider>
                    <Index />
                  </ControllerProvider>
                </AudioInputProvider>
              </BeatProvider>
            </ClipboardProvider>
          </ProjectProvider>
        </ShortcutProvider>
      </BrowserRouter>
    </Clickwrap>
  </StrictMode>,
);
