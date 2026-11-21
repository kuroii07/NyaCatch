import { EventEmitter } from "node:events";
import { afterEach, expect, test, vi } from "vitest";
import { ServiceRunner } from "../src/index";

const { killMock } = vi.hoisted(() => ({ killMock: vi.fn() }));
vi.mock("tree-kill", () => ({ default: killMock }));

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

function service() {
  const runner = new ServiceRunner({
    executableDir: ".",
    executableName: "unused-test-service",
  });
  const child = Object.assign(new EventEmitter(), { pid: 4321 });
  Reflect.set(runner, "childProcess", child);
  return { runner, child };
}

test("a late service exit confirms shutdown despite a disappearing descendant error", async () => {
  vi.useFakeTimers();
  const { runner, child } = service();
  killMock.mockImplementation((_pid, _signal, callback) => {
    callback(new Error("A descendant exited during taskkill"));
    setTimeout(() => child.emit("exit", 0, null), 10);
  });
  const result = runner.stop();
  const checked = expect(result).resolves.toBeUndefined();
  await vi.advanceTimersByTimeAsync(10);
  await checked;
  expect(child.listenerCount("exit")).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});

test("a shutdown error remains visible when the service stays alive", async () => {
  vi.useFakeTimers();
  const { runner, child } = service();
  const error = new Error("Access denied");
  killMock.mockImplementation((_pid, _signal, callback) => callback(error));
  const checked = expect(runner.stop()).rejects.toBe(error);
  await vi.advanceTimersByTimeAsync(1000);
  await checked;
  expect(child.listenerCount("exit")).toBe(0);
});

test("an exit preceding the shutdown callback leaves no delayed error", async () => {
  vi.useFakeTimers();
  const { runner, child } = service();
  killMock.mockImplementation((_pid, _signal, callback) => {
    child.emit("exit", 0, null);
    callback(new Error("Already gone"));
  });
  await expect(runner.stop()).resolves.toBeUndefined();
  expect(vi.getTimerCount()).toBe(0);
});
