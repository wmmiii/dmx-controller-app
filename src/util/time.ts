type TickListener = (t: bigint) => void;

const tickListeners: TickListener[] = [];

export function listenToTick(listener: TickListener) {
  tickListeners.push(listener);

  return () => {
    const index = tickListeners.indexOf(listener);
    tickListeners.splice(index, 1);
  };
}

let lastTime = 0;
const INTERVAL = 1000 / 30; // 1 second / 30 FPS

function tick(time: number) {
  if (time - lastTime >= INTERVAL) {
    lastTime = time;
    const t = BigInt(Date.now());
    tickListeners.forEach((l) => l(t));
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
