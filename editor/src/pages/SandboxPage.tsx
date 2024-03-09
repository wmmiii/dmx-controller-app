import React, { JSX, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import styles from "./SandboxPage.module.scss";
import { getPhysicalWritableDevice } from '../engine/fixture';
import { ProjectContext } from '../contexts/ProjectContext';
import { AudioTrackVisualizer } from '../components/AudioTrackVisualizer';
import { SerialContext } from '../contexts/SerialContext';
import { Button } from '../components/Button';
import IconBxLink from '../icons/IconBxLink';

const BLACKOUT_UNIVERSE = new Uint8Array(512).fill(0);
const universe = new Uint8Array(512).fill(0);
const colors = [
  {
    r: 1,
    g: 0,
    b: 1,
  },
  {
    r: 1,
    g: 0.8,
    b: 0,
  },
  {
    r: 0,
    g: 0.8,
    b: 1,
  },
  {
    r: 0,
    g: 1,
    b: 0,
  },
];

export default function SandboxPage(): JSX.Element {
  const { project } = useContext(ProjectContext);
  const { port, connect, disconnect } = useContext(SerialContext);
  const [t, setT] = useState<number>(0);
  const [beats, setBeats] = useState<number[]>([778.4899574468072, 778.4899574468072 + 996.8275319148936]);
  const [beatLead, setBeatLead] = useState<number>(50);
  const [blackout, setBlackout] = useState<boolean>(false);

  const writableFixture = useMemo(
    () => {
      if (project) {
        return getPhysicalWritableDevice(project, 0, universe);
      } else {
        return null;
      }
    },
    [project]);

  const beatLength = useMemo(() => {
    if (beats.length > 1) {
      return (beats[beats.length - 1] - beats[0]) / (beats.length - 1);
    } else {
      return Number.MAX_VALUE;
    }
  }, [beats]);

  const beatStart = useMemo(() => {
    if (beats.length > 1) {
      return beats[beats.length - 1] % beatLength;
    } else {
      return 0;
    }
  }, [beats, beatLength]);

  const addBeat = useCallback(() => {
    if (beats.length > 0 && t > beats[beats.length - 1] + beatLength * 2) {
      setBeats([t]);
    } else {
      setBeats([...beats, t]);
    }
  }, [beats, t]);

  useEffect(() => {
    const func = (ev: KeyboardEvent) => {
      console.log(ev.code);
      switch (ev.code) {
        case 'Space':
          addBeat();
          break;
        case 'KeyC':
          connect();
          break;
        case 'KeyB':
          setBlackout(!blackout);
          break;
      }
    };

    document.addEventListener('keydown', func);

    return () => document.removeEventListener('keydown', func);
  }, [addBeat, connect, blackout, setBlackout]);

  useEffect(() => {
    const flash = 1 - ((t - beatStart) % beatLength) / beatLength;
    document.getElementById('beat').style.opacity = String(flash);
  }, [t, beatStart, beatLength]);

  if (!("serial" in navigator)) {
    return (
      <div className={styles.wrapper}>
        <h1>Serial output not supported.</h1>
      </div>
    );
  }

  useEffect(() => {
    if (!port || !writableFixture) {
      return;
    }

    const writer = port.writable.getWriter();

    if (blackout) {
      (async () => {
        try {
          await writer.write(BLACKOUT_UNIVERSE);
        } catch (e) {
          console.error(e);
          disconnect();
        }
      })();
    } else {
      writableFixture.setRGBW(0.8, 0, 1, 0);
      writableFixture.setTilt(-45);
      writableFixture.setChannel(5, 0);
      writableFixture.setChannel(6, 255);

      (async () => {
        const pan = Math.sin(t / 1000) * 180;
        writableFixture.setPan(pan);
        const tilt = Math.sin(t / 1200) * 45;
        writableFixture.setTilt(tilt);
        const ts = t - beatStart + beatLead;
        const beatNum = Math.floor(ts / beatLength);
        const color = colors[beatNum % colors.length];
        const flash = 1 - (ts % beatLength) / beatLength;
        writableFixture.setRGB(color.r * flash, color.g * flash, color.b * flash);

        try {
          await writer.write(universe);
        } catch (e) {
          console.error(e);
          disconnect();
        }
      })();
    }
  }, [t, port, blackout, beatStart, beatLength, beatLead]);

  return (
    <div className={styles.wrapper}>
      <p>Blackout: {String(blackout)}</p>
      <Button onClick={() => connect()}>Connect</Button>
      {
        port == null ?
          <p>
            Not connected yet.
          </p> :
          <p>
            Connected!
          </p>
      }
      <Button
        icon={<IconBxLink />}
        onClick={() => addBeat()}>
        Beat
      </Button>
      <input type="number"
        onChange={(e) => setBeatLead(Number(e.target.value))}
        value={beatLead} />
      <div id="beat" className={styles.beat}>
        Beat start: {beatStart}<br />
        Beat length: {beatLength}
      </div>
    </div>
  );
}
