import { test } from "node:test";
import assert from "node:assert/strict";
import { extractHeadings, slugifyHeading } from "./headings.js";

test("slugifyHeading: lowercase and dash", () => {
  assert.equal(
    slugifyHeading("Requirement: Spec list with filtering"),
    "requirement-spec-list-with-filtering",
  );
});

test("slugifyHeading: collapses non-alphanumeric runs", () => {
  assert.equal(slugifyHeading("Hello,  World!! How?"), "hello-world-how");
});

test("slugifyHeading: preserves Unicode word characters", () => {
  assert.equal(slugifyHeading("章節 Foo"), "章節-foo");
});

test("slugifyHeading: empty string returns empty", () => {
  assert.equal(slugifyHeading(""), "");
});

test("extractHeadings: basic h2 and h3 in document order", () => {
  const content = `## Section A\n\n### Sub A1\n\n## Section B\n`;
  assert.deepEqual(extractHeadings(content), [
    { level: 2, text: "Section A", slug: "section-a" },
    { level: 3, text: "Sub A1", slug: "sub-a1" },
    { level: 2, text: "Section B", slug: "section-b" },
  ]);
});

test("extractHeadings: ignores h1 and h4+", () => {
  const content = `# Title\n\n## Section\n\n#### Detail\n\n##### Deeper\n`;
  assert.deepEqual(extractHeadings(content), [
    { level: 2, text: "Section", slug: "section" },
  ]);
});

test("extractHeadings: ignores headings inside fenced code blocks", () => {
  const content = [
    "## Real Section",
    "",
    "```md",
    "## Fake Section",
    "### Fake Sub",
    "```",
    "",
    "## After",
    "",
    "~~~",
    "### Also Fake",
    "~~~",
    "",
    "### Real Sub",
  ].join("\n");
  assert.deepEqual(extractHeadings(content), [
    { level: 2, text: "Real Section", slug: "real-section" },
    { level: 2, text: "After", slug: "after" },
    { level: 3, text: "Real Sub", slug: "real-sub" },
  ]);
});

test("extractHeadings: duplicate headings get numeric suffix", () => {
  const content = `## Scenario: Foo\n\n### Details\n\n## Scenario: Foo\n\n### Details\n`;
  assert.deepEqual(extractHeadings(content), [
    { level: 2, text: "Scenario: Foo", slug: "scenario-foo" },
    { level: 3, text: "Details", slug: "details" },
    { level: 2, text: "Scenario: Foo", slug: "scenario-foo-2" },
    { level: 3, text: "Details", slug: "details-2" },
  ]);
});

test("extractHeadings: Unicode text preserved in slug", () => {
  const content = `## 章節 Foo\n`;
  assert.deepEqual(extractHeadings(content), [
    { level: 2, text: "章節 Foo", slug: "章節-foo" },
  ]);
});

test("extractHeadings: empty content returns empty array", () => {
  assert.deepEqual(extractHeadings(""), []);
});

test("extractHeadings: skips headings whose slug would be empty", () => {
  const content = `## ???\n\n## Real\n`;
  assert.deepEqual(extractHeadings(content), [
    { level: 2, text: "Real", slug: "real" },
  ]);
});
