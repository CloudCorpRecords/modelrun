/**
 * modelrun types.
 *
 * Shapes follow the public Replicate API: models are addressed by
 * owner/name, versions belong to models, collections group models,
 * and predictions run a version or an official model with a
 * free-form `input` object. HTTP access is described by a minimal
 * response surface so tests can inject a fake fetch and never touch
 * the network.
 */

export interface ListModelsOptions {
  cursor?: string;
}

export interface GetModelOptions {
  owner: string;
  name: string;
}

export interface GetCollectionOptions {
  slug: string;
}

export interface ListModelVersionsOptions {
  owner: string;
  name: string;
}

export interface GetModelVersionOptions {
  owner: string;
  name: string;
  versionId: string;
}

export interface CreatePredictionOptions {
  version?: string;
  model?: string;
  input: Record<string, unknown>;
  webhook?: string;
}

export interface GetPredictionOptions {
  predictionId: string;
}

export interface ListPredictionsOptions {
  cursor?: string;
}

export interface CancelPredictionOptions {
  predictionId: string;
}

/** Minimal HTTP response surface so tests can inject fixtures. */
export interface HttpResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export type FetchFn = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    redirect?: string;
  },
) => Promise<HttpResponse>;
