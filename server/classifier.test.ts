import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { classifyImage, isSupportedPrediction } from "./classifier";

describe("isSupportedPrediction", () => {
  it("only accepts model names in the active pilot catalogue", () => {
    expect(isSupportedPrediction("device_model", "tecno spark 10", ["Tecno Spark 10"])).toBe(true);
    expect(isSupportedPrediction("device_model", "iPhone 17", ["Tecno Spark 10"])).toBe(false);
  });

  describe("classifyImage", () => {
    it("accepts predictions only from the local service and scoped labels", async () => {
      const server = createServer((_request, response) => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ predictionType: "visible_damage", predictedClass: "cracked_front_screen", confidence: 0.87 }));
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Classifier test server did not start.");
      const priorUrl = process.env.REJENGA_CLASSIFIER_URL;
      process.env.REJENGA_CLASSIFIER_URL = `http://127.0.0.1:${address.port}/classify`;
      try {
        await expect(classifyImage(Buffer.from("image"), "image/jpeg", ["Tecno Spark 10"])).resolves.toMatchObject({
          status: "classified",
          predictionType: "visible_damage",
          predictedClass: "cracked_front_screen",
          confidence: 0.87,
        });
      } finally {
        if (priorUrl === undefined) delete process.env.REJENGA_CLASSIFIER_URL;
        else process.env.REJENGA_CLASSIFIER_URL = priorUrl;
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
    });

    it("rejects remote inference endpoints before transmitting an image", async () => {
      const priorUrl = process.env.REJENGA_CLASSIFIER_URL;
      process.env.REJENGA_CLASSIFIER_URL = "https://classifier.example.test/predict";
      try {
        await expect(classifyImage(Buffer.from("private image"), "image/jpeg", [])).rejects.toThrow("loopback host");
      } finally {
        if (priorUrl === undefined) delete process.env.REJENGA_CLASSIFIER_URL;
        else process.env.REJENGA_CLASSIFIER_URL = priorUrl;
      }
    });

    it("does not follow a classifier redirect with the uploaded image", async () => {
      let redirectedRequest = false;
      const server = createServer((_request, response) => {
        response.writeHead(302, { location: "https://classifier.example.test/collect" }).end();
      });
      server.on("request", () => { redirectedRequest = true; });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Classifier test server did not start.");
      const priorUrl = process.env.REJENGA_CLASSIFIER_URL;
      process.env.REJENGA_CLASSIFIER_URL = `http://127.0.0.1:${address.port}/classify`;
      try {
        await expect(classifyImage(Buffer.from("private image"), "image/jpeg", [])).rejects.toThrow();
        expect(redirectedRequest).toBe(true);
      } finally {
        if (priorUrl === undefined) delete process.env.REJENGA_CLASSIFIER_URL;
        else process.env.REJENGA_CLASSIFIER_URL = priorUrl;
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
    });
  });

  it("limits image labels to visible damage rather than internal condition or safety", () => {
    expect(isSupportedPrediction("visible_damage", "cracked_front_screen", [])).toBe(true);
    expect(isSupportedPrediction("visible_damage", "battery_safe", [])).toBe(false);
    expect(isSupportedPrediction("battery_health", "good", [])).toBe(false);
  });
});
