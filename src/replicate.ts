/**
 * modelrun core: eleven tools against the Replicate API.
 *
 * All calls go to https://api.replicate.com/v1 with the API token
 * from REPLICATE_API_TOKEN sent as `Authorization: Bearer`:
 *
 *   list_models          GET  /models
 *   get_model            GET  /models/{owner}/{name}
 *   list_collections     GET  /collections
 *   get_collection       GET  /collections/{slug}
 *   list_model_versions  GET  /models/{owner}/{name}/versions
 *   get_model_version    GET  /models/{owner}/{name}/versions/{version}
 *   create_prediction    POST /predictions (version or model + input)
 *   get_prediction       GET  /predictions/{id}
 *   list_predictions     GET  /predictions
 *   cancel_prediction    POST /predictions/{id}/cancel
 *   get_account          GET  /account
 *
 * Replicate documents no search endpoint, so none is offered here:
 * discovery is list_models / list_collections plus get_model.
 *
 * A missing token is an error before any request is made, and the
 * error names the REPLICATE_API_TOKEN variable. HTTP failures
 * surface the status plus Replicate's own detail/title when present.
 * All HTTP goes through an injected FetchFn so everything is
 * testable offline.
 */
import type {
  CancelPredictionOptions,
  CreatePredictionOptions,
  FetchFn,
  GetCollectionOptions,
  GetModelOptions,
  GetModelVersionOptions,
  GetPredictionOptions,
  ListModelVersionsOptions,
  ListModelsOptions,
  ListPredictionsOptions,
} from "./types.js";

export const VERSION = "0.1.0";

export const API_BASE = "https://api.replicate.com/v1";

export const API_KEY_ENV = "REPLICATE_API_TOKEN";

/** The honest missing-key error. Names the variable, never a value. */
export function requireApiKey(apiKey: string | undefined): string {
  const key = typeof apiKey === "string" ? apiKey.trim() : "";
  if (!key) {
    throw new Error(
      "REPLICATE_API_TOKEN environment variable is required: set REPLICATE_API_TOKEN to a Replicate API token and retry",
    );
  }
  return key;
}

function requireId(value: unknown, field: string): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) throw new Error(`${field} must be a non-empty string`);
  return v;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function seg(value: string): string {
  return encodeURIComponent(value);
}

interface CallInit {
  method?: string;
  query?: Record<string, string>;
  body?: unknown;
}

async function callReplicate(
  fetchFn: FetchFn,
  apiKey: string | undefined,
  path: string,
  init: CallInit = {},
): Promise<unknown> {
  const key = requireApiKey(apiKey);
  let url = `${API_BASE}${path}`;
  if (init.query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(init.query)) params.set(k, v);
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }
  let response;
  try {
    response = await fetchFn(url, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch (err) {
    throw new Error(
      `Replicate API request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!response.ok) {
    let detail = "";
    try {
      const payload: unknown = await response.json();
      if (isRecord(payload)) {
        const d = typeof payload.detail === "string" ? payload.detail : "";
        const t = typeof payload.title === "string" ? payload.title : "";
        detail = `: ${[t, d].filter(Boolean).join(" - ")}`.trimEnd();
        if (detail === ":") detail = "";
      }
    } catch {
      // A non-JSON error body still reports its HTTP status below.
    }
    throw new Error(
      `Replicate API request failed: HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}${detail}`,
    );
  }
  try {
    return await response.json();
  } catch {
    throw new Error("Replicate API returned a response that was not valid JSON");
  }
}

function cursorQuery(options: { cursor?: string }): Record<string, string> {
  return options.cursor ? { cursor: options.cursor } : {};
}

/** List models (one page; follow the returned cursor for more). */
export async function listModels(
  fetchFn: FetchFn,
  apiKey: string | undefined,
  options: ListModelsOptions = {},
): Promise<unknown> {
  return callReplicate(fetchFn, apiKey, "/models", { query: cursorQuery(options) });
}

/** Fetch one model by owner and name. */
export async function getModel(
  fetchFn: FetchFn,
  apiKey: string | undefined,
  options: GetModelOptions,
): Promise<unknown> {
  const owner = requireId(options.owner, "owner");
  const name = requireId(options.name, "name");
  return callReplicate(fetchFn, apiKey, `/models/${seg(owner)}/${seg(name)}`);
}

/** List model collections. */
export async function listCollections(
  fetchFn: FetchFn,
  apiKey: string | undefined,
): Promise<unknown> {
  return callReplicate(fetchFn, apiKey, "/collections");
}

/** Fetch one collection by slug, including its models. */
export async function getCollection(
  fetchFn: FetchFn,
  apiKey: string | undefined,
  options: GetCollectionOptions,
): Promise<unknown> {
  const slug = requireId(options.slug, "slug");
  return callReplicate(fetchFn, apiKey, `/collections/${seg(slug)}`);
}

/** List the versions of one model. */
export async function listModelVersions(
  fetchFn: FetchFn,
  apiKey: string | undefined,
  options: ListModelVersionsOptions,
): Promise<unknown> {
  const owner = requireId(options.owner, "owner");
  const name = requireId(options.name, "name");
  return callReplicate(fetchFn, apiKey, `/models/${seg(owner)}/${seg(name)}/versions`);
}

/** Fetch one version of one model. */
export async function getModelVersion(
  fetchFn: FetchFn,
  apiKey: string | undefined,
  options: GetModelVersionOptions,
): Promise<unknown> {
  const owner = requireId(options.owner, "owner");
  const name = requireId(options.name, "name");
  const versionId = requireId(options.versionId, "versionId");
  return callReplicate(
    fetchFn,
    apiKey,
    `/models/${seg(owner)}/${seg(name)}/versions/${seg(versionId)}`,
  );
}

/**
 * Create a prediction. Exactly one of `version` (a model version ID)
 * or `model` (an official model as "owner/name") selects what runs;
 * `input` is the model's input object, passed through unchanged.
 */
export async function createPrediction(
  fetchFn: FetchFn,
  apiKey: string | undefined,
  options: CreatePredictionOptions,
): Promise<unknown> {
  if (!isRecord(options.input)) throw new Error("input must be an object of model inputs");
  const hasVersion = typeof options.version === "string" && options.version.trim() !== "";
  const hasModel = typeof options.model === "string" && options.model.trim() !== "";
  if (hasVersion === hasModel) {
    throw new Error("create_prediction needs exactly one of version or model");
  }
  const body: Record<string, unknown> = { input: options.input };
  if (hasVersion) body.version = (options.version as string).trim();
  if (hasModel) body.model = (options.model as string).trim();
  if (options.webhook !== undefined) body.webhook = options.webhook;
  return callReplicate(fetchFn, apiKey, "/predictions", { method: "POST", body });
}

/** Fetch one prediction by ID, including its status and output. */
export async function getPrediction(
  fetchFn: FetchFn,
  apiKey: string | undefined,
  options: GetPredictionOptions,
): Promise<unknown> {
  const predictionId = requireId(options.predictionId, "predictionId");
  return callReplicate(fetchFn, apiKey, `/predictions/${seg(predictionId)}`);
}

/** List predictions (one page; follow the returned cursor). */
export async function listPredictions(
  fetchFn: FetchFn,
  apiKey: string | undefined,
  options: ListPredictionsOptions = {},
): Promise<unknown> {
  return callReplicate(fetchFn, apiKey, "/predictions", { query: cursorQuery(options) });
}

/** Cancel a running prediction. */
export async function cancelPrediction(
  fetchFn: FetchFn,
  apiKey: string | undefined,
  options: CancelPredictionOptions,
): Promise<unknown> {
  const predictionId = requireId(options.predictionId, "predictionId");
  return callReplicate(fetchFn, apiKey, `/predictions/${seg(predictionId)}/cancel`, {
    method: "POST",
  });
}

/** Fetch the account that owns the configured token. */
export async function getAccount(
  fetchFn: FetchFn,
  apiKey: string | undefined,
): Promise<unknown> {
  return callReplicate(fetchFn, apiKey, "/account");
}

/** Render an upstream payload as the JSON text block MCP clients show. */
export function formatPayload(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}
