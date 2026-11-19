import { describe, expect, it } from "vitest";
import { evaluate, predict, stratifiedSplit, trainSoftmax } from "@/server/ai/probe";

describe("linear probe", () => {
  it("learns separable classes and reports held-out accuracy", () => {
    const samples = Array.from({ length: 60 }, (_, i) => {
      const y = i % 3;
      const x = [0, 0, 0].map((_, d) => (d === y ? 1 : 0) + ((i * 37) % 10) / 100);
      return { x, y };
    });
    const { train, test } = stratifiedSplit(samples, 0.2);
    expect(test.length).toBe(12);
    const model = trainSoftmax(train, 3, { epochs: 200, lr: 1 });
    expect(predict(model, [1, 0, 0]).label).toBe(0);
    const r = evaluate(model, test, 3, 0.5);
    expect(r.accuracy).toBe(1);
    expect(r.confusion.flat().reduce((a, b) => a + b, 0)).toBe(12);
  });
});
