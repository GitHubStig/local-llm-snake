import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { createGame, toView } from "../src/game/engine.ts";
import { DEFAULT_RULES, type GameState, type Ruleset } from "../src/game/types.ts";
import {
  DEFAULT_SETTINGS,
  buildSchema,
  buildUser,
  planned,
  renderBoard,
  type PromptFile,
  type PromptSettings,
} from "../src/ai/prompt.ts";

const file: PromptFile = {
  system: "rules",
  user: "{{board}}\n\nWhich direction?",
  schema: {
    type: "object",
    properties: { direction: { type: "string" }, why: { type: "string" } },
    required: ["direction"],
  },
};

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
    const state = board();
    const text = renderBoard(state, toView(state), settings());

    assert.match(text, /Grid: 12 wide by 12 tall\./);
    assert.match(text, /Head: \(6,6\)/);
    assert.match(text, /Body, head to tail: \(6,6\), \(6,7\), \(6,8\)/);
    assert.match(text, /Food: \(3,9\)/);
    assert.match(text, /Heading: north/);
  });

  test("coordinates only, by default, since showing both measured worst", () => {
    const state = board();
    const text = renderBoard(state, toView(state), settings());
    assert.ok(!/^[.oH*]{12}$/m.test(text), "no ASCII grid rows in the default representation");
  });

  test("the grid representation draws head, body and food", () => {
    const state = board();
    const text = renderBoard(state, toView(state), settings({ representation: "grid" }));
    const rows = text.split("\n");

    assert.equal(rows.length, 12);
    assert.equal(rows[6][6], "H");
    assert.equal(rows[7][6], "o");
    assert.equal(rows[9][3], "*");
  });
});

describe("assistance levels", () => {
  const text = (level: PromptSettings["level"]) => {
    const state = board();
    return renderBoard(state, toView(state), settings({ level }));
  };

  test("level 0 hands over nothing but the board", () => {
    const at0 = text(0);
    assert.ok(!at0.includes("Legal moves"));
    assert.ok(!at0.includes("Immediately safe"));
  });

  test("each level adds exactly its own line", () => {
    assert.match(text(1), /Legal moves: north, east, west/);
    assert.ok(!text(1).includes("Immediately safe"));

    assert.match(text(2), /Immediately safe:/);
    assert.ok(!text(2).includes("Reachable open space"));

    assert.match(text(3), /Reachable open space:/);
    assert.ok(!text(3).includes("Recommended"));

    assert.match(text(4), /Recommended: (north|east|west)/);
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

describe("schema assembly", () => {
  test("injects the legal moves as the direction enum", () => {
    const state = board();
    const schema = buildSchema(file, toView(state).legalMoves, true);
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    assert.deepEqual(properties.direction.enum, ["north", "east", "west"]);
  });

  test("drops why when the toggle is off", () => {
    const schema = buildSchema(file, ["north"], false);
    const properties = schema.properties as Record<string, unknown>;
    assert.ok(!("why" in properties));
  });

  test("never mutates the prompt file", () => {
    const before = structuredClone(file.schema);
    buildSchema(file, ["north"], false);
    assert.deepEqual(file.schema, before);
  });
});

describe("user message", () => {
  test("substitutes the board into the template", () => {
    const state = board();
    const user = buildUser(file, state, toView(state), settings());
    assert.ok(!user.includes("{{board}}"));
    assert.match(user, /Which direction\?$/);
  });
});
