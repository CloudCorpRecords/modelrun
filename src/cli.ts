#!/usr/bin/env node
/**
 * modelrun CLI.
 *
 *   modelrun models [--cursor c]
 *   modelrun model <owner> <name>
 *   modelrun collections
 *   modelrun collection <slug>
 *   modelrun versions <owner> <name>
 *   modelrun version <owner> <name> <versionId>
 *   modelrun predict --version <id> <input-json>
 *   modelrun predict --model <owner/name> <input-json> [--webhook url]
 *   modelrun prediction <predictionId>
 *   modelrun predictions [--cursor c]
 *   modelrun cancel <predictionId>
 *   modelrun account
 *   modelrun mcp
 *
 * Reads the Replicate token from REPLICATE_API_TOKEN.
 * Exit codes: 0 success, 1 API error, 2 usage error.
 */
import {
  API_KEY_ENV,
  cancelPrediction,
  createPrediction,
  formatPayload,
  getAccount,
  getCollection,
  getModel,
  getModelVersion,
  getPrediction,
  listCollections,
  listModelVersions,
  listModels,
  listPredictions,
  VERSION,
} from "./replicate.js";
import type { FetchFn } from "./types.js";

function usage(): never {
  console.error(`Usage:
  modelrun models [--cursor c]
  modelrun model <owner> <name>
  modelrun collections
  modelrun collection <slug>
  modelrun versions <owner> <name>
  modelrun version <owner> <name> <versionId>
  modelrun predict --version <id> <input-json>
  modelrun predict --model <owner/name> <input-json> [--webhook url]
  modelrun prediction <predictionId>
  modelrun predictions [--cursor c]
  modelrun cancel <predictionId>
  modelrun account
  modelrun mcp
  modelrun --version`);
  process.exit(2);
}

function flagValue(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx < 0 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function withoutFlags(args: string[], valueFlags: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (valueFlags.includes(args[i])) i++;
    else out.push(args[i]);
  }
  return out;
}

function parseJson(raw: string | undefined): unknown {
  if (!raw) usage();
  try {
    return JSON.parse(raw as string);
  } catch {
    console.error("error: argument is not valid JSON");
    process.exit(2);
  }
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") {
    console.log(VERSION);
    return;
  }
  if (cmd === "mcp") {
    await import("./mcp.js");
    return;
  }
  if (!cmd) usage();
  const fetchFn = globalThis.fetch as unknown as FetchFn;
  const apiKey = process.env[API_KEY_ENV];
  const known = [
    "models", "model", "collections", "collection", "versions", "version",
    "predict", "prediction", "predictions", "cancel", "account",
  ];
  if (!known.includes(cmd)) usage();
  try {
    let out: unknown;
    if (cmd === "models") {
      out = await listModels(fetchFn, apiKey, { cursor: flagValue(rest, "--cursor") });
    } else if (cmd === "model") {
      if (!rest[0] || !rest[1]) usage();
      out = await getModel(fetchFn, apiKey, { owner: rest[0], name: rest[1] });
    } else if (cmd === "collections") {
      out = await listCollections(fetchFn, apiKey);
    } else if (cmd === "collection") {
      if (!rest[0]) usage();
      out = await getCollection(fetchFn, apiKey, { slug: rest[0] });
    } else if (cmd === "versions") {
      if (!rest[0] || !rest[1]) usage();
      out = await listModelVersions(fetchFn, apiKey, { owner: rest[0], name: rest[1] });
    } else if (cmd === "version") {
      if (!rest[0] || !rest[1] || !rest[2]) usage();
      out = await getModelVersion(fetchFn, apiKey, {
        owner: rest[0],
        name: rest[1],
        versionId: rest[2],
      });
    } else if (cmd === "predict") {
      const pos = withoutFlags(rest, ["--version", "--model", "--webhook"]);
      if (!pos[0]) usage();
      out = await createPrediction(fetchFn, apiKey, {
        version: flagValue(rest, "--version"),
        model: flagValue(rest, "--model"),
        input: parseJson(pos[0]) as Record<string, unknown>,
        webhook: flagValue(rest, "--webhook"),
      });
    } else if (cmd === "prediction") {
      if (!rest[0]) usage();
      out = await getPrediction(fetchFn, apiKey, { predictionId: rest[0] });
    } else if (cmd === "predictions") {
      out = await listPredictions(fetchFn, apiKey, { cursor: flagValue(rest, "--cursor") });
    } else if (cmd === "cancel") {
      if (!rest[0]) usage();
      out = await cancelPrediction(fetchFn, apiKey, { predictionId: rest[0] });
    } else {
      out = await getAccount(fetchFn, apiKey);
    }
    console.log(formatPayload(out));
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

void main();
