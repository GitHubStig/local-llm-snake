import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { analyze } from "../src/game/analysis.ts";
import { createGame, toView } from "../src/game/engine.ts";
import type { GameState, Point } from "../src/game/types.ts";
import {
  buildSchema,
  buildUser,
  describeOption,
  renderGrid,
  type PromptFile,
} from "../src/ai/prompt.ts";
import shippedPrompt from "../src/prompts/jev-parity.json" with { type: "json" };

/** The exact prompt the app ships, via a JSON import that needs no read permission. */
const shipped = shippedPrompt as PromptFile;
const pts = (...xs: [number, number][]): Point[] => xs.map(([col, row]) => ({ col, row }));

/** Head (6,6) heading north, body trailing south, one food at (3,9). */
function board(over: Partial<GameState> = {}): GameState {
  return {
    ...createGame(1),
    snake: pts([6, 6], [6, 7], [6, 8]),
    food: pts([3, 9]),
    heading: "north",
    ...over,
  };
}

const user = (state = board()) => buildUser(shipped, toView(state), analyze(state));

describe("the grid", () => {
  test("marks head, body, tail and food as the legend says", () => {
    const rows = renderGrid(toView(board({ snake: pts([6, 6], [6, 7], [6, 8], [6, 9]) }))).split(
      "\n",
    );
    assert.equal(rows.length, 12);
    assert.equal(rows[6][6], "H");
    assert.equal(rows[7][6], "o");
    assert.equal(rows[9][6], "T");
    assert.equal(rows[9][3], "F");
  });

  test("the legend lives in the system prompt, where it can be cached", () => {
    assert.match(shipped.system, /H is the snake's head, o its body, T its tail, F the food/);
  });
});

describe("options", () => {
  test("each option is one self-contained line of exact facts", () => {
    const line = describeOption(analyze(board()).find((f) => f.direction === "west")!);
    assert.equal(
      line,
      "- west (left turn): the head moves to row 6, column 5; the food is 5 steps away " +
        "after this move; 141 of 141 empty cells stay reachable; the tail can still be followed out",
    );
  });

  test("a move that eats says so instead of giving a distance", () => {
    const state = board({ food: pts([6, 5]) });
    const north = analyze(state).find((f) => f.direction === "north")!;
    assert.match(describeOption(north), /this move EATS THE FOOD/);
  });

  test("a dead end is flagged in capitals", () => {
    const state = board({
      rules: { ...board().rules, width: 4, height: 3 },
      snake: pts([1, 0], [1, 1], [0, 1], [0, 2], [1, 2], [2, 2], [3, 2], [3, 1]),
      food: pts([3, 0]),
    });
    const west = analyze(state).find((f) => f.direction === "west")!;
    assert.match(describeOption(west), /DEAD END: less room than the snake is long/);
  });

  test("only safe moves are offered", () => {
    // Against the north wall, north would be fatal.
    const state = board({ snake: pts([6, 0], [6, 1], [6, 2]) });
    assert.ok(!/^- north/m.test(user(state)));
    assert.match(user(state), /^- east/m);
  });
});

describe("the shipped prompt", () => {
  test("its system prompt is static, so it can be cached", () => {
    assert.ok(!shipped.system.includes("{{"), "no placeholders in the system prompt");
  });

  test("every placeholder in its template is known", () => {
    assert.doesNotThrow(() => user());
    assert.ok(!user().includes("{{"));
  });

  test("carries the same state JEV is given", () => {
    const text = user();
    assert.match(text, /Head: row 6, column 6/);
    assert.match(text, /Food: row 9, column 3/);
    assert.match(text, /Heading: north/);
    assert.match(text, /Snake length: 3/);
    assert.match(text, /Grid: 12 rows by 12 columns/);
    assert.match(text, /Food is next to the head: no/);
    assert.match(text, /^Options:$/m);
  });

  test("answers before explaining", () => {
    // At temperature 0 the direction is then decoded from the same prefix as
    // with why off, so asking why can never change the move.
    const keys = Object.keys(shipped.schema.properties as object);
    assert.ok(keys.indexOf("direction") < keys.indexOf("why"));
  });
});

describe("templates", () => {
  test("an unknown placeholder is a typo, and throws", () => {
    const bad: PromptFile = { ...shipped, user: "{{bored}}" };
    const state = board();
    assert.throws(
      () => buildUser(bad, toView(state), analyze(state)),
      /unknown placeholder \{\{bored\}\}/,
    );
  });
});

describe("schema assembly", () => {
  test("the enum is exactly the options offered", () => {
    const properties = buildSchema(shipped, ["east", "west"], true).properties as Record<
      string,
      Record<string, unknown>
    >;
    assert.deepEqual(properties.direction.enum, ["east", "west"]);
  });

  test("asking why makes it required, not merely allowed", () => {
    assert.ok((buildSchema(shipped, ["east"], true).required as string[]).includes("why"));
  });

  test("not asking why removes it entirely", () => {
    const schema = buildSchema(shipped, ["east"], false);
    assert.ok(!("why" in (schema.properties as object)));
    assert.deepEqual(schema.required, ["direction"]);
  });

  test("keeps direction ahead of why", () => {
    assert.deepEqual(Object.keys(buildSchema(shipped, ["east"], true).properties as object), [
      "direction",
      "why",
    ]);
  });

  test("never mutates the prompt file", () => {
    const before = structuredClone(shipped.schema);
    buildSchema(shipped, ["east"], false);
    assert.deepEqual(shipped.schema, before);
  });
});
