import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { createGame } from "../src/game/engine.ts";
import {
  Runner,
  controllerShare,
  horizonFor,
  projectStraight,
  type Clock,
} from "../src/game/runner.ts";
import { HumanController } from "../src/game/controllers/human.ts";
import type { Controller, Decision } from "../src/game/controller.ts";
import type { Direction, GameView } from "../src/game/types.ts";

/** Let pending promise callbacks run. */
const flush = () => new Promise((r) => setTimeout(r, 0));

class FakeClock implements Clock {
  time = 0;
  #queue: { at: number; fn: () => void; handle: number }[] = [];
  #next = 1;

  now() {
    return this.time;
  }
  setTimeout(fn: () => void, ms: number) {
    const handle = this.#next++;
    this.#queue.push({ at: this.time + ms, fn, handle });
    return handle;
  }
  clearTimeout(handle: unknown) {
    this.#queue = this.#queue.filter((e) => e.handle !== handle);
  }
  /** Run every callback due at or before `time + ms`. */
  advance(ms: number) {
    this.time += ms;
    const due = this.#queue.filter((e) => e.at <= this.time).sort((a, b) => a.at - b.at);
    this.#queue = this.#queue.filter((e) => e.at > this.time);
    for (const e of due) e.fn();
  }
}

/** Answers instantly — stands in for any fast controller. */
class Instant implements Controller {
  readonly id = "instant";
  #direction: Direction;
  constructor(direction: Direction) {
    this.#direction = direction;
  }
  decide(): Promise<Decision> {
    return Promise.resolve({ direction: this.#direction });
  }
}

/** Never answers — stands in for a model that always misses the deadline. */
class Silent implements Controller {
  readonly id = "silent";
  decide(_v: GameView, signal: AbortSignal): Promise<Decision> {
    return new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted")));
    });
  }
}

/** Resolves only when the test says so, so overlap can be driven precisely. */
class Deferred implements Controller {
  readonly id = "deferred";
  #pending: ((d: Decision) => void)[] = [];
  calls = 0;
  /** Every board this controller was sent, to check projection. */
  views: GameView[] = [];

  decide(view: GameView): Promise<Decision> {
    this.calls++;
    this.views.push(view);
    return new Promise<Decision>((resolve) => this.#pending.push(resolve));
  }
  /** Answer the oldest outstanding request. */
  async answer(direction: Direction, forced = false) {
    this.#pending.shift()?.({ direction, forced });
    await flush();
  }
}

const runner = (controller: Controller, over: Partial<{ project: boolean }> = {}) => {
  const clock = new FakeClock();
  const r = new Runner(createGame(1), { seed: 1, controller, clock, ...over });
  return { r, clock };
};

describe("runner: deciding a tick", () => {
  test("uses the controller's answer when one is stored", async () => {
    const { r } = runner(new Instant("west"));
    r.start();
    await flush();
    r.advance();

    assert.equal(r.state.heading, "west");
    assert.equal(r.record.moves.at(-1)?.decidedBy, "controller");
    assert.equal(controllerShare(r.record), 1);
  });

  test("continues straight when nothing has arrived, and counts it", async () => {
    const { r } = runner(new Silent());
    r.start();
    await flush();
    r.advance();

    assert.equal(r.state.heading, "north");
    assert.equal(r.record.moves.at(-1)?.decidedBy, "continueStraight");
    assert.equal(r.record.failures.timedOut, 1);
    assert.equal(controllerShare(r.record), 0);
  });

  test("applies a late answer however late, as long as it is still safe", async () => {
    const deferred = new Deferred();
    const { r } = runner(deferred);
    r.start();
    await flush();

    for (let i = 0; i < 5; i++) r.advance(); // nothing arrives for five ticks
    await deferred.answer("west"); // about the board at tick 0

    r.advance();
    assert.equal(r.state.heading, "west", "no age limit: west is still safe");
    assert.equal(r.record.moves.at(-1)?.lateness, 5);
    assert.equal(r.record.failures.lateUnsafe, 0);
  });

  test("discards a late answer that is no longer safe, and goes straight", async () => {
    const deferred = new Deferred();
    const { r } = runner(deferred);
    r.start();
    await flush();

    // Head starts at row 6 heading north. Six ticks later it is against the
    // wall, and "north" — safe when it was asked — would now leave the grid.
    for (let i = 0; i < 6; i++) r.advance();
    await deferred.answer("north");

    r.advance();
    assert.equal(r.record.failures.lateUnsafe, 1);
    assert.equal(r.record.moves.at(-1)?.decidedBy, "continueStraight");
  });

  test("rejects an answer that would reverse onto the neck", async () => {
    const deferred = new Deferred();
    const { r } = runner(deferred);
    r.start();
    await flush();

    // Turn west first, which makes the pending "east" a reverse.
    await deferred.answer("west");
    r.advance();
    assert.equal(r.state.heading, "west");

    await deferred.answer("east");
    r.advance();
    assert.equal(r.record.failures.illegalOnArrival, 1);
    assert.equal(r.state.heading, "west");
  });

  test("counts a legal but fatal move as game-invalid", async () => {
    const { r } = runner(new Instant("north"));
    r.start();
    await flush();
    // Head starts at row 6 heading north; six ticks reach the wall.
    for (let i = 0; i < 7; i++) {
      r.advance();
      await flush();
    }
    assert.equal(r.state.outcome, "crashed");
    assert.equal(r.record.failures.gameInvalid, 1);
  });
});

describe("runner: forced moves", () => {
  test("are recorded as forced, apart from controller decisions", async () => {
    const forced: Controller = {
      id: "forced",
      decide: () => Promise.resolve({ direction: "west", forced: true }),
    };
    const { r } = runner(forced);
    r.start();
    await flush();
    r.advance();

    assert.equal(r.record.moves.at(-1)?.decidedBy, "forced");
    assert.equal(controllerShare(r.record), 0, "a forced move is not the controller's");
  });
});

describe("projection arithmetic", () => {
  test("projects nothing until a latency has been measured", () => {
    assert.equal(horizonFor([], 400), 0);
  });

  test("projects one tick fewer than the ticks the answer spans", () => {
    // At 400 ms a tick: under a tick lands in time for the current board.
    assert.equal(horizonFor([300], 400), 0);
    assert.equal(horizonFor([700], 400), 1);
    assert.equal(horizonFor([1100], 400), 2);
  });

  test("leans on the slow end of recent latencies, not the typical one", () => {
    // The 75th percentile: one fast call among slow ones does not shorten it.
    assert.equal(horizonFor([100, 900, 900, 900], 400), 2);
    // Nor does one slow outlier among fast ones lengthen it.
    assert.equal(horizonFor([100, 100, 100, 900], 400), 0);
  });

  test("steps the board forward exactly, going straight", () => {
    const board = projectStraight(createGame(1), 2);
    assert.deepEqual(board.snake[0], { col: 6, row: 4 });
    assert.equal(board.tick, 2);
  });

  test("stops short of a move that would end the game", () => {
    // Head at row 6 heading north: six steps reach the wall, a seventh leaves it.
    const board = projectStraight(createGame(1), 10);
    assert.deepEqual(board.snake[0], { col: 6, row: 0 });
    assert.equal(board.outcome, null);
  });
});

describe("runner: projection", () => {
  /** Give the runner one measured latency, then let that answer be used. */
  async function measured(r: Runner, clock: FakeClock, deferred: Deferred, ms: number) {
    r.start();
    r.pause(); // tick by hand; moving the clock must not fire ticks
    await flush();
    clock.time += ms;
    await deferred.answer("north");
    r.advance();
    await flush();
  }

  test("sends the board as it will be when the answer lands", async () => {
    const deferred = new Deferred();
    const { r, clock } = runner(deferred);
    await measured(r, clock, deferred, 1100); // two ticks ahead at 400 ms

    const live = r.state.snake[0];
    const sent = deferred.views.at(-1)!.snake[0];
    assert.equal(r.horizon, 2);
    assert.deepEqual(sent, { col: live.col, row: live.row - 2 }, "two cells further on");
  });

  test("holds an early answer until its tick, then applies it on time", async () => {
    const deferred = new Deferred();
    const { r, clock } = runner(deferred);
    await measured(r, clock, deferred, 1100);

    await deferred.answer("west"); // arrives at once, for two ticks from now
    r.advance();
    r.advance();
    assert.equal(r.state.heading, "north", "held: straight, as projected");
    assert.deepEqual(
      r.record.moves.slice(-2).map((m) => m.decidedBy),
      ["planned", "planned"],
      "going straight to plan is not a miss",
    );

    r.advance();
    assert.equal(r.state.heading, "west");
    const move = r.record.moves.at(-1)!;
    assert.equal(move.horizon, 2);
    assert.equal(move.lateness, 0);
    assert.equal(r.record.failures.timedOut, 0, "waiting for a projected tick is not a timeout");
  });

  test("a new game starts projected when latency carries over", async () => {
    // Without the carried window, the first request of every game went out
    // unprojected, just as the snake heads for the wall six cells away.
    const deferred = new Deferred();
    const clock = new FakeClock();
    const r = new Runner(createGame(1), {
      seed: 1,
      controller: deferred,
      clock,
      latencies: [1100],
    });
    assert.equal(r.horizon, 2);
    r.start();
    r.pause();
    await flush();
    assert.equal(deferred.views[0].tick, 2, "the very first request is for two ticks ahead");
  });

  test("controller share counts only the ticks where a decision was due", async () => {
    const deferred = new Deferred();
    const { r, clock } = runner(deferred);
    await measured(r, clock, deferred, 1100); // one decided move so far
    await deferred.answer("west");
    for (let i = 0; i < 3; i++) r.advance(); // two planned, then west on time

    const kinds = r.record.moves.map((m) => m.decidedBy);
    assert.deepEqual(kinds, ["controller", "planned", "planned", "controller"]);
    assert.equal(controllerShare(r.record), 1, "every due decision was the controller's");
  });

  test("projects nothing when switched off", async () => {
    const deferred = new Deferred();
    const { r, clock } = runner(deferred, { project: false });
    await measured(r, clock, deferred, 1100);
    assert.equal(r.horizon, 0);
  });

  test("never projects a keypress, which answers the board on screen", async () => {
    const { r } = runner(new HumanController());
    assert.equal(r.horizon, 0);
  });

  test("forced answers say nothing about latency", async () => {
    const deferred = new Deferred();
    const { r, clock } = runner(deferred);
    r.start();
    r.pause();
    await flush();
    clock.time += 1100;
    await deferred.answer("north", true);
    assert.equal(r.horizon, 0, "an instant code decision must not stretch the estimate");
  });

  test("counts a crash while an answer was still coming as latency's fault", async () => {
    const { r } = runner(new Silent());
    r.start();
    r.pause();
    await flush();
    for (let i = 0; i < 7; i++) r.advance(); // straight into the north wall
    assert.equal(r.state.outcome, "crashed");
    assert.equal(r.record.failures.diedWaiting, 1);
    assert.equal(r.record.failures.gameInvalid, 0, "the model never chose that move");
  });
});

describe("runner: overlap", () => {
  test("holds one request at a time and re-asks once an answer is consumed", async () => {
    const deferred = new Deferred();
    const { r } = runner(deferred);
    r.start();
    await flush();
    assert.equal(deferred.calls, 1);

    await deferred.answer("west");
    assert.equal(
      deferred.calls,
      1,
      "an unconsumed answer already describes this board, so no new request",
    );

    r.advance();
    await flush();
    assert.equal(deferred.calls, 2, "consuming it opens the next request");
  });

  test("a controller slower than the tick still contributes moves", async () => {
    const deferred = new Deferred();
    const { r } = runner(deferred);
    r.start();
    await flush();

    r.advance(); // no answer yet
    r.advance();
    assert.equal(r.record.failures.timedOut, 2);

    await deferred.answer("west"); // lands mid-flight, three ticks late
    r.advance();

    assert.equal(r.state.heading, "west");
    assert.equal(r.record.moves.at(-1)?.decidedBy, "controller");
    assert.equal(r.record.moves.at(-1)?.lateness, 2, "acted on a board two ticks old");
  });

  test("reports an outstanding request, and stops while an answer waits", async () => {
    const deferred = new Deferred();
    const { r } = runner(deferred);
    r.start();
    await flush();
    assert.equal(r.inFlightSince, 0);

    await deferred.answer("west");
    assert.equal(r.inFlightSince, null, "nothing outstanding while an answer is held");

    r.advance();
    await flush();
    assert.notEqual(r.inFlightSince, null, "consuming it opens the next request");
  });
});

describe("runner: clock", () => {
  test("start ticks on the configured interval, pause stops it", async () => {
    const { r, clock } = runner(new Instant("west"));
    r.start();
    await flush();

    clock.advance(400);
    assert.equal(r.state.tick, 1);

    r.pause();
    clock.advance(4000);
    assert.equal(r.state.tick, 1, "a paused runner does not advance");
    assert.equal(r.running, false);
  });

  test("stopping from inside a tick stops the loop", async () => {
    // Stopping at a tick cap is done from onTick. The loop used to reschedule
    // itself after onTick returned, leaving the game running unseen.
    const clock = new FakeClock();
    const r: Runner = new Runner(createGame(1), {
      seed: 1,
      controller: new Instant("west"),
      clock,
      onTick: (state) => {
        if (state.tick >= 2) r.stop();
      },
    });
    r.start();
    await flush();
    clock.advance(400);
    clock.advance(400);
    clock.advance(4000);
    assert.equal(r.state.tick, 2);
    assert.equal(r.running, false);
  });

  test("a stopped runner asks the controller nothing more", async () => {
    const deferred = new Deferred();
    const clock = new FakeClock();
    const r: Runner = new Runner(createGame(1), {
      seed: 1,
      controller: deferred,
      clock,
      onTick: () => r.stop(),
    });
    r.start();
    await flush();
    const before = deferred.calls;
    clock.advance(400); // one tick, which stops the runner from onTick
    await flush();
    assert.equal(deferred.calls, before, "no request opened after stopping");
  });

  test("advance steps exactly once while paused", async () => {
    const { r } = runner(new Instant("west"));
    r.start();
    r.pause();
    await flush();

    r.advance();
    assert.equal(r.state.tick, 1);
  });
});

describe("human controller", () => {
  test("resolves on the next press", async () => {
    const human = new HumanController();
    const pending = human.decide({} as GameView, new AbortController().signal);
    human.press("west");
    assert.deepEqual(await pending, { direction: "west" });
  });

  test("queues a press made before the request", async () => {
    const human = new HumanController();
    human.press("east");
    const decision = await human.decide({} as GameView, new AbortController().signal);
    assert.equal(decision.direction, "east");
  });

  test("queues only one press, so the second turn is not lost", async () => {
    const human = new HumanController();
    human.press("east");
    human.press("south");

    const first = await human.decide({} as GameView, new AbortController().signal);
    assert.equal(first.direction, "east", "the first press is honoured first");

    const second = human.decide({} as GameView, new AbortController().signal);
    human.press("south");
    assert.equal((await second).direction, "south");
  });

  test("a press after a long straight run is honoured, not discarded as stale", async () => {
    // Driving straight means pressing nothing, so the keyboard's request stays
    // open from the tick it was made on. The press itself is a decision about
    // the board on screen now, whatever tick the request was opened.
    const human = new HumanController();
    const { r } = runner(human);
    r.start();
    await flush();

    for (let i = 0; i < 4; i++) r.advance(); // four ticks straight, no keys
    human.press("east");
    await flush();
    r.advance();

    assert.equal(r.state.heading, "east", "the last-moment turn must register");
    assert.equal(r.record.failures.lateUnsafe, 0);
  });

  test("takeover is a controller swap", async () => {
    const human = new HumanController();
    const { r } = runner(new Instant("west"));
    r.start();
    await flush();

    r.setController(human);
    human.press("east");
    await flush();
    r.advance();

    assert.equal(r.state.heading, "east");
  });
});
