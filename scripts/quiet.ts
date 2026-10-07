/**
 * Gets the machine ready to time a model: unloads every model Ollama holds,
 * then waits until the GPU is idle. A model left loaded by an earlier run, or
 * anything else using the GPU, skews latencies (findings.md §19).
 */
import { execFileSync } from "node:child_process";

const IDLE_PERCENT = 5;
const IDLE_SAMPLES = 3;

/** The GPU's current utilisation, or null where it cannot be read (not macOS). */
export function gpuUtilisation(): number | null {
  if (process.platform !== "darwin") return null;
  const out = execFileSync("ioreg", ["-r", "-d", "1", "-c", "IOAccelerator"], { encoding: "utf8" });
  const match = /"Device Utilization %"=(\d+)/.exec(out);
  return match ? Number(match[1]) : null;
}

/**
 * `ollama stop`, not a `keep_alive: 0` request: decision models reject
 * /api/generate, and a /v1/systemone request would load the model first.
 */
export async function unloadAll(baseUrl = "http://localhost:11434"): Promise<string[]> {
  const res = await fetch(`${baseUrl}/api/ps`);
  if (!res.ok) throw new Error(`Ollama /api/ps returned ${res.status}`);
  const { models = [] } = (await res.json()) as { models?: { name: string }[] };
  for (const m of models) execFileSync("ollama", ["stop", m.name], { stdio: "ignore" });
  return models.map((m) => m.name);
}

/** Resolves once the GPU has stayed idle for a few seconds running. */
export async function waitForIdleGpu(): Promise<void> {
  if (gpuUtilisation() === null) {
    console.warn("GPU utilisation cannot be read here; not waiting for it to be idle");
    return;
  }
  let idle = 0;
  let warned = false;
  while (idle < IDLE_SAMPLES) {
    const use = gpuUtilisation() ?? 0;
    if (use <= IDLE_PERCENT) idle++;
    else {
      idle = 0;
      if (!warned) console.warn(`GPU busy (${use}%); waiting for it to be idle`);
      warned = true;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

export async function quietMachine(): Promise<void> {
  await unloadAll();
  await waitForIdleGpu();
}
