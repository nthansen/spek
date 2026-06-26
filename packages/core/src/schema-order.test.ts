import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOrderFromStatus } from "./schema-order.js";

// 模擬 `openspec status --change <slug> --json` 的輸出
function statusJson(order: string[], paths: Record<string, string>): unknown {
  return {
    actionContext: { planningArtifacts: order },
    artifactPaths: Object.fromEntries(
      Object.entries(paths).map(([id, outputPath]) => [id, { outputPath }]),
    ),
  };
}

test("parseOrderFromStatus: extracts ordered id/outputPath pairs", () => {
  const refs = parseOrderFromStatus(
    statusJson(
      ["brainstorm", "proposal", "specs", "plan"],
      {
        brainstorm: "brainstorm.md",
        proposal: "proposal.md",
        specs: "specs/**/*.md",
        plan: "plan.md",
      },
    ),
  );
  assert.deepEqual(refs, [
    { id: "brainstorm", outputPath: "brainstorm.md" },
    { id: "proposal", outputPath: "proposal.md" },
    { id: "specs", outputPath: "specs/**/*.md" },
    { id: "plan", outputPath: "plan.md" },
  ]);
});

test("parseOrderFromStatus: preserves planningArtifacts order exactly", () => {
  const refs = parseOrderFromStatus(
    statusJson(["tasks", "proposal"], { proposal: "proposal.md", tasks: "tasks.md" }),
  );
  assert.deepEqual(refs!.map((r) => r.id), ["tasks", "proposal"]);
});

test("parseOrderFromStatus: skips ids that have no outputPath", () => {
  const refs = parseOrderFromStatus(
    statusJson(["proposal", "ghost"], { proposal: "proposal.md" }),
  );
  assert.deepEqual(refs, [{ id: "proposal", outputPath: "proposal.md" }]);
});

test("parseOrderFromStatus: non-string ids are ignored", () => {
  const refs = parseOrderFromStatus({
    actionContext: { planningArtifacts: ["proposal", 42, null] },
    artifactPaths: { proposal: { outputPath: "proposal.md" } },
  });
  assert.deepEqual(refs, [{ id: "proposal", outputPath: "proposal.md" }]);
});

test("parseOrderFromStatus: a numeric id is rejected even if its string form is a path key", () => {
  // the typeof-string guard must drop non-string ids; without it, `paths[42]` would coerce
  // to `paths["42"]` and wrongly emit an entry
  const refs = parseOrderFromStatus({
    actionContext: { planningArtifacts: [42] },
    artifactPaths: { "42": { outputPath: "foo.md" } },
  });
  assert.equal(refs, null);
});

test("parseOrderFromStatus: non-string outputPath is skipped", () => {
  const refs = parseOrderFromStatus({
    actionContext: { planningArtifacts: ["proposal"] },
    artifactPaths: { proposal: { outputPath: 123 } },
  });
  assert.equal(refs, null);
});

test("parseOrderFromStatus: returns null when nothing resolves", () => {
  assert.equal(parseOrderFromStatus(statusJson([], {})), null);
  assert.equal(parseOrderFromStatus(statusJson(["x"], {})), null);
});

test("parseOrderFromStatus: returns null for malformed shapes", () => {
  assert.equal(parseOrderFromStatus(null), null);
  assert.equal(parseOrderFromStatus(undefined), null);
  assert.equal(parseOrderFromStatus("nope"), null);
  assert.equal(parseOrderFromStatus(42), null);
  assert.equal(parseOrderFromStatus({}), null);
  // planningArtifacts not an array
  assert.equal(parseOrderFromStatus({ actionContext: { planningArtifacts: "x" }, artifactPaths: {} }), null);
  // missing artifactPaths
  assert.equal(parseOrderFromStatus({ actionContext: { planningArtifacts: ["a"] } }), null);
});
