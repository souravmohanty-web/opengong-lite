// Tiny concurrency limiter (token-optimization.md §cache-mechanics: p-limit(3)
// fan-out). Zero deps — this is the whole of what p-limit gives us for our needs:
// a FIFO queue of thunks, at most `concurrency` in flight at once.

export function pLimit(concurrency) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(`pLimit: concurrency must be a positive integer, got ${concurrency}`);
  }
  let active = 0;
  const queue = [];

  function next() {
    if (active >= concurrency || queue.length === 0) return;
    active += 1;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve()
      .then(fn)
      .then(resolve, reject)
      .finally(() => { active -= 1; next(); });
  }

  return function limited(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
  };
}
