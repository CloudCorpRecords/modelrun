import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cancelPrediction,
  createPrediction,
  getAccount,
  getCollection,
  getModel,
  getModelVersion,
  getPrediction,
  listCollections,
  listModelVersions,
  listModels,
  listPredictions,
  requireApiKey,
} from "../src/replicate.js";
import type { FetchFn, HttpResponse } from "../src/types.js";

function jsonResponse(body: unknown, status = 200, statusText = "OK"): HttpResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: { get: () => "application/json" },
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

interface Captured {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

function fakeFetch(captured: Captured, body: unknown = { results: [] }): FetchFn {
  return async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    captured.url = url;
    captured.method = init?.method;
    captured.headers = init?.headers;
    captured.body = init?.body;
    return jsonResponse(body);
  };
}

describe("requireApiKey", () => {
  it("rejects a missing or blank token naming REPLICATE_API_TOKEN", () => {
    assert.throws(() => requireApiKey(undefined), /REPLICATE_API_TOKEN/);
    assert.throws(() => requireApiKey("  "), /REPLICATE_API_TOKEN/);
    assert.equal(requireApiKey(" r8_x "), "r8_x");
  });

  it("fails before any request when the key is missing", async () => {
    let called = false;
    const spy: FetchFn = async () => {
      called = true;
      return jsonResponse({});
    };
    await assert.rejects(() => listModels(spy, undefined), /REPLICATE_API_TOKEN/);
    assert.equal(called, false);
  });
});

describe("models", () => {
  it("lists models with the Bearer header and cursor paging", async () => {
    const captured: Captured = {};
    await listModels(fakeFetch(captured, { results: [{ owner: "meta", name: "m" }] }), "tok", {
      cursor: "c2",
    });
    const url = new URL(captured.url ?? "");
    assert.equal(url.pathname, "/v1/models");
    assert.equal(url.searchParams.get("cursor"), "c2");
    assert.equal(captured.headers?.Authorization, "Bearer tok");
    assert.equal(captured.method, "GET");
  });

  it("gets one model and its versions by owner/name paths", async () => {
    const c: Captured = {};
    const out = (await getModel(fakeFetch(c, { owner: "meta", name: "llama" }), "k", {
      owner: "meta",
      name: "llama",
    })) as { name: string };
    assert.equal(out.name, "llama");
    assert.equal(new URL(c.url ?? "").pathname, "/v1/models/meta/llama");
    const v: Captured = {};
    await listModelVersions(fakeFetch(v, { results: [] }), "k", { owner: "meta", name: "llama" });
    assert.equal(new URL(v.url ?? "").pathname, "/v1/models/meta/llama/versions");
    const one: Captured = {};
    await getModelVersion(fakeFetch(one, { id: "v1" }), "k", {
      owner: "meta",
      name: "llama",
      versionId: "v1",
    });
    assert.equal(new URL(one.url ?? "").pathname, "/v1/models/meta/llama/versions/v1");
  });
});

describe("collections", () => {
  it("lists collections and gets one by slug", async () => {
    const c: Captured = {};
    await listCollections(fakeFetch(c, { results: [] }), "k");
    assert.equal(new URL(c.url ?? "").pathname, "/v1/collections");
    const g: Captured = {};
    await getCollection(fakeFetch(g, { slug: "text-to-image", models: [] }), "k", {
      slug: "text-to-image",
    });
    assert.equal(new URL(g.url ?? "").pathname, "/v1/collections/text-to-image");
  });
});

describe("predictions", () => {
  it("creates a prediction from a version ID", async () => {
    const captured: Captured = {};
    await createPrediction(fakeFetch(captured, { id: "p1", status: "starting" }), "k", {
      version: "abc123",
      input: { prompt: "a cat" },
    });
    assert.equal(new URL(captured.url ?? "").pathname, "/v1/predictions");
    assert.equal(captured.method, "POST");
    assert.deepEqual(JSON.parse(captured.body ?? "{}"), {
      input: { prompt: "a cat" },
      version: "abc123",
    });
  });

  it("creates a prediction for an official model via the model field", async () => {
    const captured: Captured = {};
    await createPrediction(fakeFetch(captured, { id: "p2" }), "k", {
      model: "meta/meta-llama-3-70b-instruct",
      input: { prompt: "hi" },
      webhook: "https://example.com/hook",
    });
    assert.deepEqual(JSON.parse(captured.body ?? "{}"), {
      input: { prompt: "hi" },
      model: "meta/meta-llama-3-70b-instruct",
      webhook: "https://example.com/hook",
    });
  });

  it("rejects both version and model, and neither, before any request", async () => {
    let called = false;
    const spy: FetchFn = async () => {
      called = true;
      return jsonResponse({});
    };
    await assert.rejects(
      () => createPrediction(spy, "k", { version: "v", model: "o/n", input: {} }),
      /exactly one of version or model/,
    );
    await assert.rejects(() => createPrediction(spy, "k", { input: {} }), /exactly one/);
    assert.equal(called, false);
  });

  it("gets, lists, and cancels predictions", async () => {
    const g: Captured = {};
    await getPrediction(fakeFetch(g, { id: "p1", status: "succeeded" }), "k", { predictionId: "p1" });
    assert.equal(new URL(g.url ?? "").pathname, "/v1/predictions/p1");
    const l: Captured = {};
    await listPredictions(fakeFetch(l, { results: [] }), "k", {});
    assert.equal(new URL(l.url ?? "").pathname, "/v1/predictions");
    const c: Captured = {};
    await cancelPrediction(fakeFetch(c, { id: "p1", status: "canceled" }), "k", { predictionId: "p1" });
    assert.equal(new URL(c.url ?? "").pathname, "/v1/predictions/p1/cancel");
    assert.equal(c.method, "POST");
  });
});

describe("account and errors", () => {
  it("gets the account", async () => {
    const captured: Captured = {};
    const out = (await getAccount(fakeFetch(captured, { type: "user", username: "ada" }), "k")) as {
      username: string;
    };
    assert.equal(out.username, "ada");
    assert.equal(new URL(captured.url ?? "").pathname, "/v1/account");
  });

  it("surfaces HTTP status plus Replicate title and detail", async () => {
    const failing: FetchFn = async () =>
      jsonResponse({ title: "Not Found", detail: "model not found" }, 404, "Not Found");
    await assert.rejects(
      () => getModel(failing, "k", { owner: "o", name: "n" }),
      /HTTP 404.*Not Found - model not found/,
    );
  });
});
