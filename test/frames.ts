// A hand-cranked requestAnimationFrame, so tests decide when frames happen.
export function fakeFrames(frameMs = 1000 / 60) {
    let queue = new Map<number, FrameRequestCallback>();
    let id = 0, now = 0;
    const g = globalThis as any;
    const saved = { raf: g.requestAnimationFrame, caf: g.cancelAnimationFrame };
    g.requestAnimationFrame = (cb: FrameRequestCallback) => { queue.set(++id, cb); return id; };
    g.cancelAnimationFrame = (n: number) => { queue.delete(n); };
    const step = () => { now += frameMs; const q = queue; queue = new Map(); q.forEach((cb) => cb(now)); };
    return {
        step,
        run(n: number) { for (let i = 0; i < n && queue.size; i++) step(); },
        pending: () => queue.size,
        uninstall() { g.requestAnimationFrame = saved.raf; g.cancelAnimationFrame = saved.caf; },
    };
}
