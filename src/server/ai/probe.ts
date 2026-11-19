import { softmax } from "./classifier-math";

export type Sample = { x: number[]; y: number };

/** Multinomial logistic regression (softmax) trained with full-batch gradient descent and L2 regularisation. */
export function trainSoftmax(samples: Sample[], classes: number, opts: { epochs?: number; lr?: number; l2?: number } = {}) {
  const { epochs = 300, lr = 0.5, l2 = 1e-3 } = opts;
  const dim = samples[0]?.x.length ?? 0;
  const W = Array.from({ length: classes }, () => new Array<number>(dim).fill(0));
  const b = new Array<number>(classes).fill(0);
  for (let epoch = 0; epoch < epochs; epoch++) {
    const gW = Array.from({ length: classes }, () => new Array<number>(dim).fill(0));
    const gb = new Array<number>(classes).fill(0);
    for (const { x, y } of samples) {
      const p = softmax(W.map((w, k) => dot(w, x) + b[k]));
      for (let k = 0; k < classes; k++) {
        const err = p[k] - (k === y ? 1 : 0);
        gb[k] += err;
        const row = gW[k];
        for (let d = 0; d < dim; d++) row[d] += err * x[d];
      }
    }
    const n = samples.length || 1;
    for (let k = 0; k < classes; k++) {
      b[k] -= (lr * gb[k]) / n;
      for (let d = 0; d < dim; d++) W[k][d] -= lr * (gW[k][d] / n + l2 * W[k][d]);
    }
  }
  return { W, b };
}

export function predict(model: { W: number[][]; b: number[] }, x: number[]) {
  const p = softmax(model.W.map((w, k) => dot(w, x) + model.b[k]));
  let best = 0;
  for (let k = 1; k < p.length; k++) if (p[k] > p[best]) best = k;
  return { label: best, confidence: p[best] };
}

/** Deterministic stratified split so every class appears in the test set when it has 2+ images. */
export function stratifiedSplit<T extends { y: number }>(items: T[], testFraction = 0.2, seed = 42) {
  let s = seed;
  const rand = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const byClass = new Map<number, T[]>();
  for (const it of items) byClass.set(it.y, [...(byClass.get(it.y) ?? []), it]);
  const train: T[] = [];
  const test: T[] = [];
  for (const group of byClass.values()) {
    const shuffled = [...group].sort(() => rand() - 0.5);
    const nTest = group.length >= 2 ? Math.max(1, Math.round(group.length * testFraction)) : 0;
    test.push(...shuffled.slice(0, nTest));
    train.push(...shuffled.slice(nTest));
  }
  return { train, test };
}

export function evaluate(model: { W: number[][]; b: number[] }, samples: Sample[], classes: number, lowConfidence: number) {
  const confusion = Array.from({ length: classes }, () => new Array<number>(classes).fill(0));
  let correct = 0;
  let low = 0;
  let correctWhenConfident = 0;
  for (const s of samples) {
    const { label, confidence } = predict(model, s.x);
    confusion[s.y][label]++;
    if (label === s.y) correct++;
    if (confidence < lowConfidence) low++;
    else if (label === s.y) correctWhenConfident++;
  }
  const n = samples.length || 1;
  const confident = samples.length - low;
  return {
    accuracy: correct / n,
    lowConfidenceRate: low / n,
    accuracyWhenConfident: confident ? correctWhenConfident / confident : null,
    confusion,
  };
}

function dot(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
