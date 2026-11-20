import { isIP } from "node:net";

export interface Classification {
  status: "classified" | "unconfigured" | "failed";
  predictionType: "device_model" | "visible_damage" | null;
  predictedClass: string | null;
  confidence: number | null;
}

const visibleDamageClasses = new Set([
  "cracked_front_screen",
  "broken_front_screen",
  "cracked_back_cover",
  "broken_camera_lens",
  "no_visible_external_damage",
  "unknown",
]);

export function isSupportedPrediction(predictionType: unknown, predictedClass: string, supportedModels: string[]): boolean {
  if (predictionType === "device_model") {
    return supportedModels.some((model) => model.toLocaleLowerCase() === predictedClass.trim().toLocaleLowerCase());
  }
  return predictionType === "visible_damage" && visibleDamageClasses.has(predictedClass.trim());
}

function isLoopback(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "::1" || (isIP(host) === 4 && host.startsWith("127."));
}

export async function classifyImage(buffer: Buffer, mimeType: string, supportedModels: string[]): Promise<Classification> {
  const endpoint = process.env.REJENGA_CLASSIFIER_URL;
  if (!endpoint) return { status: "unconfigured", predictionType: null, predictedClass: null, confidence: null };

  const url = new URL(endpoint);
  if (url.protocol !== "http:" || !isLoopback(url.hostname)) {
    throw new Error("REJENGA_CLASSIFIER_URL must use HTTP on a loopback host; uploaded images must not be sent to a third party.");
  }

  const form = new FormData();
  const imageBytes = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(imageBytes).set(buffer);
  form.append("image", new Blob([imageBytes], { type: mimeType }), "listing-image");
  const response = await fetch(url, { method: "POST", body: form, redirect: "error", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Local classifier returned HTTP ${response.status}`);

  const result: unknown = await response.json();
  if (typeof result !== "object" || result === null || !("predictionType" in result) || !("predictedClass" in result) || !("confidence" in result)) {
    throw new Error("Local classifier returned an invalid response.");
  }
  const { predictionType, predictedClass, confidence } = result as { predictionType: unknown; predictedClass: unknown; confidence: unknown };
  if (typeof predictedClass !== "string" || !predictedClass.trim()
    || typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error("Local classifier returned an invalid prediction or confidence.");
  }
  if (predictionType !== "device_model" && predictionType !== "visible_damage") {
    throw new Error("Local classifier returned an unsupported prediction type.");
  }
  if (!isSupportedPrediction(predictionType, predictedClass, supportedModels)) {
    throw new Error("Local classifier returned a class outside the supported pilot categories.");
  }
  return { status: "classified", predictionType, predictedClass: predictedClass.trim(), confidence };
}
