import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Children, createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { catalogs } from "@pi-desktop/i18n";
import { createServer } from "vite";

import {
  missingPlanSafeTools,
  normalizePlanSafeTools,
  planSafeToolsError,
} from "../src/components/extensions/mcp-plan-safe.ts";

test("normalizePlanSafeTools trims names and rejects wildcards", () => {
  assert.deepEqual(normalizePlanSafeTools([" search-docs ", "get_page", ""]), [
    "search-docs",
    "get_page",
  ]);
  assert.equal(planSafeToolsError(["search*"]), "shape");
  assert.equal(
    planSafeToolsError(Array.from({ length: 33 }, (_, index) => `tool${index}`)),
    "count",
  );
  assert.throws(() => normalizePlanSafeTools(["search*"]), /MCP_INVALID/);
  assert.throws(
    () => normalizePlanSafeTools(Array.from({ length: 33 }, (_, index) => `tool${index}`)),
    /MCP_INVALID/,
  );
});

test("missingPlanSafeTools stays quiet until a test advertised names", () => {
  assert.deepEqual(missingPlanSafeTools(["lookup"], undefined), []);
  assert.deepEqual(missingPlanSafeTools(["lookup", "gone"], ["lookup", "ping"]), ["gone"]);
});

test("MCP editor validates and edits one shared Plan/Goal list", async (t) => {
  const server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    configFile: false,
    server: { middlewareMode: true, hmr: false, ws: false },
    esbuild: { jsx: "automatic" },
    appType: "custom",
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  t.after(() => server.close());
  const { McpEditorSheet, emptyMcpDraft, mcpDraftError, draftToInput } =
    await server.ssrLoadModule("/src/components/extensions/McpEditorSheet.tsx");
  const { Button, Checkbox, Field, Input } = await server.ssrLoadModule("/src/components/ui.tsx");
  const i18n = createInstance();
  await i18n.init({ lng: "en", resources: { en: { translation: catalogs.en } } });

  function* elements(node) {
    if (!isValidElement(node)) return;
    yield node;
    for (const child of Children.toArray(node.props.children)) yield* elements(child);
  }

  function render(draft, status) {
    let tree;
    let next = draft;
    // Capture real handlers between SSR renders without replacing components.
    function Harness() {
      tree = McpEditorSheet({
        draft, setDraft: (value) => { next = value; },
        editing: null, saving: false, testing: false, projects: [], status,
        onClose() {}, onSave() {}, onTest() {},
      });
      return tree;
    }
    const html = renderToStaticMarkup(createElement(I18nextProvider, { i18n }, createElement(Harness)));
    return {
      html,
      nodes: [...elements(tree)],
      input: () => [...elements(tree)].find((node) => node.type === Input &&
        node.props.placeholder === i18n.t("extensions.mcp.planSafePlaceholder")),
      next: () => next,
    };
  }

  for (const transport of ["stdio", "http"]) {
    const base = { ...emptyMcpDraft(), id: "ctx", transport, url: "https://example.test/mcp" };
    for (const [planSafeTools, error] of [
      [["search*"], "extensions.mcp.errorPlanSafeShape"],
      [Array.from({ length: 33 }, (_, i) => `tool${i}`), "extensions.mcp.errorPlanSafeCount"],
    ]) {
      await t.test(`${transport} disables save for ${error}`, () => {
        const draft = { ...base, planSafeTools };
        assert.equal(mcpDraftError(draft), error);
        const save = render(draft).nodes.find((node) => node.type === Button &&
          node.props.children === i18n.t("common.save"));
        assert.equal(save?.props.disabled, true);
      });
    }
    assert.equal(mcpDraftError({ ...base, planSafeTools: [" search-docs "] }), null);
  }

  await t.test("typing comma-separated names retains each delimiter", () => {
    let draft = { ...emptyMcpDraft(), id: "ctx" };
    for (const char of "unseen,search-docs,") {
      const view = render(draft);
      const input = view.input();
      assert.ok(input, "the manual list input is rendered before discovery");
      input.props.onChange({ target: { value: input.props.value + char } });
      draft = view.next();
    }
    assert.deepEqual(draftToInput(draft).planSafeTools, ["unseen", "search-docs"]);
    const view = render(draft, { state: "ready", toolNames: ["search-docs"] });
    assert.ok(view.html.includes(i18n.t("extensions.mcp.planSafeMissing", { names: "unseen" })));
    assert.equal(mcpDraftError(draft), null, "unadvertised names remain saveable");
  });

  await t.test("handwritten names survive selecting and unselecting an advertised tool", () => {
    let draft = { ...emptyMcpDraft(), id: "ctx" };
    let view = render(draft);
    view.input().props.onChange({ target: { value: "unseen" } });
    draft = view.next();
    const status = { state: "ready", toolNames: ["lookup"] };
    for (const checked of [true, false]) {
      view = render(draft, status);
      assert.ok(view.nodes.some((node) => node.type === Field &&
        node.props.label === i18n.t("extensions.mcp.planSafe")), "the list uses the shared Field");
      const checkbox = view.nodes.find((node) => node.type === Checkbox && node.props.label === "lookup");
      assert.ok(checkbox, "a discovered tool uses the shared Checkbox");
      assert.equal(checkbox.props.checked, !checked);
      checkbox.props.onChange({ target: { checked } });
      draft = view.next();
      assert.deepEqual(draftToInput(draft).planSafeTools, checked ? ["unseen", "lookup"] : ["unseen"]);
      assert.equal(render(draft, status).input().props.value, draft.planSafeTools.join(", "));
    }
  });
});
