type TickListener = (t: bigint) => void;

const tickListeners: TickListener[] = [];

export function listenToTick(listener: TickListener) {
  tickListeners.push(listener);

  return () => {
    const index = tickListeners.indexOf(listener);
    tickListeners.splice(index, 1);
  };
}

setInterval(() => {
  requestAnimationFrame(() => {
    const t = BigInt(new Date().getTime());
    tickListeners.forEach((l) => l(t));
  });
}, 33);
