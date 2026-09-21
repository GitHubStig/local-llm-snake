import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { createGame } from "../src/game/engine.ts";
import { Runner, controllerShare, type Clock } from "../src/game/runner.ts";
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

  decide(): Promise<Decision> {
    this.calls++;
    return new Promise<Decision>((resolve) => this.#pending.push(resolve));
  }
  /** Answer the oldest outstanding request. */
  async answer(direction: Direction) {
    this.#pending.shift()?.({ direction });
    await flush();
  }
}

const runner = (controller: Controller, over: Partial<{ stalenessCap: number }> = {}) => {
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

  test("discards an answer that has aged past the staleness cap", async () => {
    const deferred = new Deferred();
    const { r } = runner(deferred, { stalenessCap: 1 });
    r.start();
    await flush();

    r.advance(); // tick 1, nothing stored yet
    r.advance(); // tick 2
    r.advance(); // tick 3
    await deferred.answer("west"); // answers the request made at tick 0

    r.advance();
    assert.equal(r.record.failures.arrivedStale, 1);
    assert.notEqual(r.state.heading, "west");
  });

  test("discards an answer that became a reverse before it landed", async () => {
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
    const { r } = runner(deferred, { stalenessCap: 5 });
    r.start();
    await flush();

    r.advance(); // no answer yet
    r.advance();
    assert.equal(r.record.failures.timedOut, 2);

    await deferred.answer("west"); // lands mid-flight, three ticks late
    r.advance();

    assert.equal(r.state.heading, "west");
    assert.equal(r.record.moves.at(-1)?.decidedBy, "controller");
    assert.equal(r.record.moves.at(-1)?.staleness, 2, "acted on a board two ticks old");
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
