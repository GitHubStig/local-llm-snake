import level0 from "./level-0.json" with { type: "json" };
import level1 from "./level-1.json" with { type: "json" };
import level2 from "./level-2.json" with { type: "json" };
import level3 from "./level-3.json" with { type: "json" };
import level4 from "./level-4.json" with { type: "json" };
import type { AssistanceLevel, PromptFile } from "../ai/prompt.ts";

/**
 * `with { type: "json" }` is what lets Node, Deno and Bun import these natively
 * — and needs no file-read permission, unlike reading them from disk.
 *
 * One prompt per assistance level, each complete in itself (ADR-0008). A level
 * is a file: everything sent to the model at that level is in it.
 */
export const LEVEL_PROMPTS: Record<AssistanceLevel, PromptFile> = {
  0: level0 as PromptFile,
  1: level1 as PromptFile,
  2: level2 as PromptFile,
  3: level3 as PromptFile,
  4: level4 as PromptFile,
};
