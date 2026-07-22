import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workerPath = path.join(
  process.cwd(),
  "workers/hr-core-worker.js"
);

const workerSource = fs.readFileSync(workerPath, "utf8");

function functionSource(name: string, nextName: string) {
  const start = workerSource.indexOf(`async function ${name}(`);
  const end = workerSource.indexOf(`async function ${nextName}(`, start);

  if (start < 0 || end < 0) {
    throw new Error(`Unable to locate ${name}`);
  }

  return workerSource.slice(start, end);
}

describe("HR task and weekly-report list queries", () => {
  it("passes URLSearchParams to the daily-task list parser", () => {
    const source = functionSource(
      "listDailyTasks",
      "createDailyTask"
    );

    expect(source).toContain(
      "parseListQuery(url.searchParams)"
    );
    expect(source).not.toContain(
      "parseListQuery(url)"
    );
  });

  it("passes URLSearchParams to the weekly-report list parser", () => {
    const source = functionSource(
      "listWeeklyReports",
      "createWeeklyReport"
    );

    expect(source).toContain(
      "parseListQuery(url.searchParams)"
    );
    expect(source).not.toContain(
      "parseListQuery(url)"
    );
  });
});
