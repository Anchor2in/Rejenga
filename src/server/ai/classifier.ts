import fs from "node:fs/promises";
import path from "node:path";
import {
  AutoProcessor,
  AutoTokenizer,
  CLIPTextModelWithProjection,
  CLIPVisionModelWithProjection,
  RawImage,
  env,
} from "@huggingface/transformers";

export const CLIP_MODEL = "Xenova/clip-vit-base-patch32";
const MODELS_DIR = path.resolve(process.env.AI_MODELS_DIR ?? "./models");
env.cacheDir = path.join(MODELS_DIR, "hf-cache");

export type Head = "model" | "damage";

/** Visible-damage classes. The prompt is what CLIP compares the photo against in zero-shot mode. */
export const DAMAGE_CLASSES: { label: string; prompt: string }[] = [
  { label: "Cracked screen", prompt: "a photo of a smartphone with a cracked or shattered screen" },
  { label: "Broken back cover", prompt: "a photo of the back of a smartphone with a cracked or broken back cover" },
  { label: "Bent or dented frame", prompt: "a photo of a smartphone with a bent or dented frame" },
  { label: "No visible damage", prompt: "a photo of a smartphone in good condition with no visible damage" },
  { label: "Not a phone photo", prompt: "a photo that does not show a mobile phone" },
];

export type Probe = { head: Head; labels: string[]; W: number[][]; b: number[]; trainedAt: string; images: number; testAccuracy: number | null };

let visionPromise: Promise<{ processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>; vision: Awaited<ReturnType<typeof CLIPVisionModelWithProjection.from_pretrained>> }> | null = null;
let textPromise: Promise<{ tokenizer: Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>; text: Awaited<ReturnType<typeof CLIPTextModelWithProjection.from_pretrained>> }> | null = null;
const textCache = new Map<string, number[]>();

function loadVision() {
  visionPromise ??= (async () => ({
    processor: await AutoProcessor.from_pretrained(CLIP_MODEL),
    vision: await CLIPVisionModelWithProjection.from_pretrained(CLIP_MODEL, { dtype: "q8" }),
  }))();
  return visionPromise;
}

function loadText() {
  textPromise ??= (async () => ({
    tokenizer: await AutoTokenizer.from_pretrained(CLIP_MODEL),
    text: await CLIPTextModelWithProjection.from_pretrained(CLIP_MODEL, { dtype: "q8" }),
  }))();
  return textPromise;
}

const normalize = (v: number[]) => {
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
};

export { softmax } from "./classifier-math";
import { softmax } from "./classifier-math";

/** L2-normalised CLIP image embedding (512 numbers). */
export async function embedImage(filePath: string): Promise<number[]> {
  const { processor, vision } = await loadVision();
  const image = await RawImage.read(filePath);
  const { image_embeds } = await vision(await processor(image));
  return normalize(Array.from(image_embeds.data as Float32Array));
}

async function embedTexts(prompts: string[]) {
  const missing = prompts.filter((p) => !textCache.has(p));
  if (missing.length) {
    const { tokenizer, text } = await loadText();
    const inputs = tokenizer(missing, { padding: true, truncation: true });
    const { text_embeds } = await text(inputs);
    const dim = text_embeds.dims[1];
    const data = Array.from(text_embeds.data as Float32Array);
    missing.forEach((p, i) => textCache.set(p, normalize(data.slice(i * dim, (i + 1) * dim))));
  }
  return prompts.map((p) => textCache.get(p)!);
}

const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

export async function zeroShot(embedding: number[], labels: string[], prompts: string[]) {
  const texts = await embedTexts(prompts);
  const probs = softmax(texts.map((t) => 100 * dot(embedding, t)));
  return best(labels, probs);
}

export function probePredict(probe: Probe, embedding: number[]) {
  const probs = softmax(probe.W.map((w, k) => dot(w, embedding) + probe.b[k]));
  return best(probe.labels, probs);
}

function best(labels: string[], probs: number[]) {
  let i = 0;
  probs.forEach((p, k) => {
    if (p > probs[i]) i = k;
  });
  return { label: labels[i], confidence: probs[i] };
}

export const probePath = (head: Head) => path.join(MODELS_DIR, `probe-${head}.json`);

export async function loadProbe(head: Head): Promise<Probe | null> {
  try {
    return JSON.parse(await fs.readFile(probePath(head), "utf8")) as Probe;
  } catch {
    return null;
  }
}

export const modelPrompt = (label: string) => `a photo of a ${label} smartphone`;

export type Prediction = {
  modelLabel: string;
  modelConfidence: number;
  damageLabel: string;
  damageConfidence: number;
  engine: string;
};

/**
 * Advisory photo check: guesses the supported phone model and the visible damage category.
 * Uses a trained linear probe on CLIP features when one exists (npm run ai:train), otherwise CLIP zero-shot.
 */
export async function classifyPhoto(filePath: string, supportedModels: string[]): Promise<Prediction> {
  const embedding = await embedImage(filePath);
  const [modelProbe, damageProbe] = await Promise.all([loadProbe("model"), loadProbe("damage")]);
  const model = modelProbe
    ? probePredict(modelProbe, embedding)
    : await zeroShot(embedding, supportedModels, supportedModels.map(modelPrompt));
  const damage = damageProbe
    ? probePredict(damageProbe, embedding)
    : await zeroShot(embedding, DAMAGE_CLASSES.map((d) => d.label), DAMAGE_CLASSES.map((d) => d.prompt));
  const engine = [
    modelProbe ? `model: trained probe (${modelProbe.trainedAt.slice(0, 10)})` : "model: CLIP zero-shot",
    damageProbe ? `damage: trained probe (${damageProbe.trainedAt.slice(0, 10)})` : "damage: CLIP zero-shot",
  ].join("; ");
  return { modelLabel: model.label, modelConfidence: model.confidence, damageLabel: damage.label, damageConfidence: damage.confidence, engine };
}
