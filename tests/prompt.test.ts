import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { createGame, toView } from "../src/game/engine.ts";
import { DEFAULT_RULES, type GameState, type Ruleset } from "../src/game/types.ts";
import {
  DEFAULT_SETTINGS,
  buildSchema,
  buildUser,
  planned,
  promptValues,
  renderBoard,
  type AssistanceLevel,
  type PromptFile,
  type PromptSettings,
} from "../src/ai/prompt.ts";

import { LEVEL_PROMPTS } from "../src/prompts/index.ts";

/** The exact prompts the app ships, via the same module it imports. */
const LEVELS = [0, 1, 2, 3, 4] as const;
const shipped = (level: AssistanceLevel): PromptFile => LEVEL_PROMPTS[level];

const settings = (over: Partial<PromptSettings> = {}): PromptSettings => ({
  ...DEFAULT_SETTINGS,
  ...over,
});
const rules = (over: Partial<Ruleset> = {}): Ruleset => ({ ...DEFAULT_RULES, ...over });

/** Head (6,6) heading north, body trailing south, one food at (3,9). */
function board(over: Partial<GameState> = {}): GameState {
  return {
    ...createGame(1),
    snake: [
      { col: 6, row: 6 },
      { col: 6, row: 7 },
      { col: 6, row: 8 },
    ],
    food: [{ col: 3, row: 9 }],
    heading: "north",
    ...over,
  };
}

describe("board rendering", () => {
  test("coordinates list the body head to tail", () => {
    const text = renderBoard(toView(board()), "coordinates");
    assert.match(text, /Grid: 12 wide by 12 tall\./);
    assert.match(text, /Head: \(6,6\)/);
    assert.match(text, /Body, head to tail: \(6,6\), \(6,7\), \(6,8\)/);
    assert.match(text, /Food: \(3,9\)/);
  });

  test("omits the heading, which the model echoed straight into the wall", () => {
    assert.ok(!/Heading:/.test(renderBoard(toView(board()), "coordinates")));
  });

  test("the grid representation draws head, body and food", () => {
    const rows = renderBoard(toView(board()), "grid")
      .split("\n")
      .filter((line) => /^[.oH*]{12}$/.test(line));
    assert.equal(rows.length, 12);
    assert.equal(rows[6][6], "H");
    assert.equal(rows[7][6], "o");
    assert.equal(rows[9][3], "*");
  });

  test("the grid explains itself, since the prompts describe coordinates", () => {
    const text = renderBoard(toView(board()), "grid");
    assert.match(text, /Row 0 is the top \(north\)/);
    assert.match(text, /H = your head, o = your body, \* = food/);
  });
});

describe("template values", () => {
  const values = () => {
    const state = board();
    return promptValues(state, toView(state), settings());
  };

  test("states where the food lies, in direction words", () => {
    // Head (6,6), food (3,9): three columns west, three rows south.
    assert.equal(values().foodOffset, "The food at (3,9) is 3 west and 3 south of the head.");
  });

  test("lists legal and safe moves, and the snake's length", () => {
    const v = values();
    assert.equal(v.legalMoves, "north, east, west");
    assert.equal(v.safeMoves, "north, east, west");
    assert.equal(v.length, "3");
  });

  test("says plainly when every move is fatal", () => {
    // Boxed into the top-left corner with the body blocking the only exit.
    const trapped = board({
      snake: [
        { col: 0, row: 0 },
        { col: 1, row: 0 },
        { col: 1, row: 1 },
        { col: 0, row: 1 },
        { col: 0, row: 2 },
      ],
      heading: "west",
    });
    assert.equal(
      promptValues(trapped, toView(trapped), settings()).safeMoves,
      "none, every move is fatal",
    );
  });
});

describe("the shipped level prompts", () => {
  for (const level of LEVELS) {
    test(`level ${level}: system prompt is static, so it can be cached`, () => {
      assert.ok(!shipped(level).system.includes("{{"), "no placeholders in the system prompt");
    });

    test(`level ${level}: every placeholder in the template is known`, () => {
      const state = board();
      assert.doesNotThrow(() => buildUser(shipped(level), state, toView(state), settings()));
    });

    test(`level ${level}: answers before explaining`, () => {
      // At temperature 0 the direction is then decoded from the same prefix as
      // with why off, so asking why can never change the move. Measured: why
      // placed first cut food eaten by more than half at most levels.
      const keys = Object.keys((shipped(level).schema.properties as object) ?? {});
      assert.ok(keys.indexOf("direction") < keys.indexOf("why"), "direction precedes why");
    });
  }

  const user = (level: AssistanceLevel) => {
    const state = board();
    return buildUser(shipped(level), state, toView(state), settings());
  };

  test("level 0 gives the board and the food's offset, and nothing else", () => {
    assert.match(user(0), /The food at \(3,9\) is 3 west and 3 south/);
    for (const hint of ["Legal moves", "Safe moves", "Open cells", "Recommended"]) {
      assert.ok(!user(0).includes(hint), `level 0 must not include "${hint}"`);
    }
  });

  test("each level adds exactly its own help", () => {
    assert.match(user(1), /Legal moves: north, east, west/);
    assert.ok(!user(1).includes("Safe moves"));

    assert.match(user(2), /Safe moves this turn:/);
    assert.ok(!user(2).includes("Open cells"));

    assert.match(user(3), /Your length: 3/);
    assert.match(user(3), /Open cells reachable after each safe move:/);
    assert.ok(!user(3).includes("Recommended"));

    assert.match(user(4), /Recommended move: (north|east|west)/);
  });
});

describe("the level 4 planner", () => {
  test("avoids a move that leads into a pocket", () => {
    // Column 2 is walled off by the body, so west is a sealed 8-cell pocket.
    const walled = board({
      rules: rules({ width: 6, height: 4 }),
      snake: [
        { col: 2, row: 0 },
        { col: 2, row: 1 },
        { col: 2, row: 2 },
        { col: 2, row: 3 },
        { col: 3, row: 3 },
      ],
      food: [{ col: 0, row: 0 }],
      heading: "north",
    });
    // Food sits inside the pocket, so only escape-route size rules west out.
    assert.equal(planned(walled, toView(walled)), "east");
  });
});

describe("templates", () => {
  test("an unknown placeholder is a typo, and throws", () => {
    const bad: PromptFile = { system: "", user: "{{bored}}", schema: shipped(0).schema };
    const state = board();
    assert.throws(
      () => buildUser(bad, state, toView(state), settings()),
      /unknown placeholder \{\{bored\}\}/,
    );
  });
});

describe("schema assembly", () => {
  const file = shipped(0);

  test("injects the legal moves as the direction enum", () => {
    const properties = buildSchema(file, ["north", "east", "west"], true).properties as Record<
      string,
      Record<string, unknown>
    >;
    assert.deepEqual(properties.direction.enum, ["north", "east", "west"]);
  });

  test("asking why makes it required, not merely allowed", () => {
    // Left optional, the model skipped it under constrained decoding.
    assert.ok((buildSchema(file, ["north"], true).required as string[]).includes("why"));
  });

  test("not asking why removes it entirely", () => {
    const schema = buildSchema(file, ["north"], false);
    assert.ok(!("why" in (schema.properties as object)));
    assert.deepEqual(schema.required, ["direction"]);
  });

  test("keeps direction ahead of why when asked", () => {
    const keys = Object.keys(buildSchema(file, ["north"], true).properties as object);
    assert.deepEqual(keys, ["direction", "why"]);
  });

  test("never mutates the prompt file", () => {
    const before = structuredClone(file.schema);
    buildSchema(file, ["north"], false);
    assert.deepEqual(file.schema, before);
  });
});
