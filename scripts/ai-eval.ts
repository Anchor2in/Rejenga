/**
 * Evaluates the classifier the app would use (trained probe if present, otherwise CLIP zero-shot)
 * on a labelled folder laid out like ai-data/<head>/<label>/*.jpg. Prints accuracy, the
 * low-confidence rate, accuracy on confident predictions and a confusion matrix.
 *
 * Usage: npm run ai:eval [-- model|damage] [dataDir]
 */
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { DAMAGE_CLASSES, embedImage, loadProbe, modelPrompt, probePredict, zeroShot, type Head } from "../src/server/ai/classifier";

const head = (process.argv[2] ?? "damage") as Head;
const root = path.resolve(process.argv[3] ?? path.join(process.env.AI_DATA_DIR ?? "./ai-data", head));
const LOW = Number(process.env.AI_LOW_CONFIDENCE ?? 0.5);

const labels = (await fs.readdir(root, { withFileTypes: true }).catch(() => [])).filter((d) => d.isDirectory()).map((d) => d.name).sort();
if (!labels.length) {
  console.log(`No class folders found in ${root}.`);
  process.exit(0);
}
const probe = await loadProbe(head);
const classLabels = probe?.labels ?? (head === "damage" ? DAMAGE_CLASSES.map((d) => d.label) : labels);
const prompts = head === "damage" ? DAMAGE_CLASSES.map((d) => d.prompt) : classLabels.map(modelPrompt);
console.log(`Engine: ${probe ? `trained probe (${probe.images} images, ${probe.trainedAt})` : "CLIP zero-shot"}`);

const confusion = new Map<string, Map<string, number>>();
let n = 0, correct = 0, low = 0, confidentCorrect = 0;
for (const label of labels) {
  for (const f of await fs.readdir(path.join(root, label))) {
    if (!/\.(jpe?g|png|webp)$/i.test(f)) continue;
    const emb = await embedImage(path.join(root, label, f));
    const pred = probe ? probePredict(probe, emb) : await zeroShot(emb, classLabels, prompts);
    n++;
    if (pred.label === label) correct++;
    if (pred.confidence < LOW) low++;
    else if (pred.label === label) confidentCorrect++;
    const row = confusion.get(label) ?? new Map();
    row.set(pred.label, (row.get(pred.label) ?? 0) + 1);
    confusion.set(label, row);
  }
}
const pctOf = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "—");
console.log(`Images: ${n}\nAccuracy: ${pctOf(correct, n)}\nLow-confidence (<${LOW}): ${pctOf(low, n)}\nAccuracy when confident: ${pctOf(confidentCorrect, n - low)}`);
console.log("\nConfusion (rows = true label):");
for (const [t, row] of confusion) console.log(`  ${t}: ${[...row].map(([p, c]) => `${p}=${c}`).join(", ")}`);
