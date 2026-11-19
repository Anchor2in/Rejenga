/**
 * Trains linear probes on CLIP image embeddings from a labelled folder of photos:
 *
 *   ai-data/model/<Brand Model>/*.jpg     e.g. ai-data/model/Tecno Spark 10/img1.jpg
 *   ai-data/damage/<Damage class>/*.jpg   e.g. ai-data/damage/Cracked screen/img1.jpg
 *
 * Usage: npm run ai:train [-- model|damage]   (defaults to both heads that have data)
 * Writes models/probe-<head>.json, which the app uses instead of zero-shot prompts.
 */
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { embedImage, probePath, type Head, type Probe } from "../src/server/ai/classifier";
import { evaluate, stratifiedSplit, trainSoftmax, type Sample } from "../src/server/ai/probe";

const DATA = path.resolve(process.env.AI_DATA_DIR ?? "./ai-data");
const LOW = Number(process.env.AI_LOW_CONFIDENCE ?? 0.5);
const IMG = /\.(jpe?g|png|webp)$/i;

export async function loadDataset(head: Head) {
  const root = path.join(DATA, head);
  const labels = (await fs.readdir(root, { withFileTypes: true }).catch(() => [])).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const items: { file: string; y: number }[] = [];
  for (const [y, label] of labels.entries()) {
    for (const f of await fs.readdir(path.join(root, label))) if (IMG.test(f)) items.push({ file: path.join(root, label, f), y });
  }
  return { labels, items };
}

export async function embedAll(items: { file: string; y: number }[]) {
  const out: (Sample & { file: string })[] = [];
  for (const [i, it] of items.entries()) {
    try {
      out.push({ ...it, x: await embedImage(it.file) });
    } catch (e) {
      console.warn(`  skipped ${it.file}: ${(e as Error).message}`);
    }
    if ((i + 1) % 20 === 0) console.log(`  embedded ${i + 1}/${items.length}`);
  }
  return out;
}

async function trainHead(head: Head) {
  const { labels, items } = await loadDataset(head);
  if (labels.length < 2) {
    console.log(`[${head}] needs at least 2 class folders in ${path.join(DATA, head)} — skipping.`);
    return;
  }
  console.log(`[${head}] ${items.length} images across ${labels.length} classes. Embedding with CLIP…`);
  const samples = await embedAll(items);
  const { train, test } = stratifiedSplit(samples, 0.2);
  const model = trainSoftmax(train, labels.length);
  const report = test.length ? evaluate(model, test, labels.length, LOW) : null;
  if (report) {
    console.log(`[${head}] held-out accuracy ${(report.accuracy * 100).toFixed(1)}% on ${test.length} images; low-confidence ${(report.lowConfidenceRate * 100).toFixed(1)}%`);
  }
  // Retrain on all data for the shipped probe; the reported accuracy comes from the held-out split above.
  const final = trainSoftmax(samples, labels.length);
  const probe: Probe = { head, labels, W: final.W, b: final.b, trainedAt: new Date().toISOString(), images: samples.length, testAccuracy: report?.accuracy ?? null };
  await fs.mkdir(path.dirname(probePath(head)), { recursive: true });
  await fs.writeFile(probePath(head), JSON.stringify(probe));
  console.log(`[${head}] saved ${probePath(head)}`);
}

const heads = (process.argv[2] ? [process.argv[2]] : ["model", "damage"]) as Head[];
for (const h of heads) await trainHead(h);
