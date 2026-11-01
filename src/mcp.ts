/**
 * modelrun MCP server. Tools: list_models, get_model,
 * list_collections, get_collection, list_model_versions,
 * get_model_version, create_prediction, get_prediction,
 * list_predictions, cancel_prediction, get_account.
 *
 * Why the low-level Server instead of McpServer: the high-level helper
 * converts zod schemas to JSON Schema and injects keys that are not in
 * this tool's public spec ("$schema" and "additionalProperties"), which
 * breaks exact tool-list/schema parity with the spec. This file serves
 * tools/list with the spec's exact input schemas as explicit literals,
 * while zod still validates every tools/call argument set.
 *
 * The Replicate token is read from REPLICATE_API_TOKEN at call time;
 * a missing key returns an honest isError result naming the variable
 * instead of failing the handshake.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
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

const NoArgs = z.object({});
const ListModelsArgs = z.object({ cursor: z.string().optional() });
const GetModelArgs = z.object({ owner: z.string(), name: z.string() });
const GetCollectionArgs = z.object({ slug: z.string() });
const ListVersionsArgs = z.object({ owner: z.string(), name: z.string() });
const GetVersionArgs = z.object({
  owner: z.string(),
  name: z.string(),
  versionId: z.string(),
});
const CreatePredictionArgs = z.object({
  version: z.string().optional(),
  model: z.string().optional(),
  input: z.record(z.string(), z.unknown()),
  webhook: z.string().optional(),
});
const PredictionIdArgs = z.object({ predictionId: z.string() });
const ListPredictionsArgs = z.object({ cursor: z.string().optional() });

const TOOLS = [
  {
    name: "list_models",
    description: "List models on Replicate, one page at a time, with an optional pagination cursor.",
    inputSchema: {
      type: "object" as const,
      properties: { cursor: { type: "string", description: "Optional pagination cursor from a previous response to fetch the next page of models." } },
    },
  },
  {
    name: "get_model",
    description: "Fetch one model by owner and name, including its description and latest version summary.",
    inputSchema: {
      type: "object" as const,
      properties: {
        owner: { type: "string", description: "The owner (user or organization) of the model to fetch." },
        name: { type: "string", description: "The name of the model to fetch." },
      },
      required: ["owner", "name"],
    },
  },
  {
    name: "list_collections",
    description: "List the curated model collections on Replicate.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "get_collection",
    description: "Fetch one collection by slug, including the models it contains.",
    inputSchema: {
      type: "object" as const,
      properties: { slug: { type: "string", description: "The slug identifier of the collection to fetch." } },
      required: ["slug"],
    },
  },
  {
    name: "list_model_versions",
    description: "List the versions of one model by owner and name.",
    inputSchema: {
      type: "object" as const,
      properties: {
        owner: { type: "string", description: "The owner (user or organization) of the model whose versions to list." },
        name: { type: "string", description: "The name of the model whose versions to list." },
      },
      required: ["owner", "name"],
    },
  },
  {
    name: "get_model_version",
    description: "Fetch one version of one model, including its input/output schema.",
    inputSchema: {
      type: "object" as const,
      properties: {
        owner: { type: "string", description: "The owner (user or organization) of the model." },
        name: { type: "string", description: "The name of the model." },
        versionId: { type: "string", description: "The identifier of the specific model version to fetch." },
      },
      required: ["owner", "name", "versionId"],
    },
  },
  {
    name: "create_prediction",
    description: "Create a prediction: run a model version (version) or an official model (model, as owner/name) with the given input object, and an optional webhook.",
    inputSchema: {
      type: "object" as const,
      properties: {
        version: { type: "string", description: "Optional model version ID to run; exactly one of version or model must be given." },
        model: { type: "string", description: "Optional official model to run as 'owner/name'; exactly one of version or model must be given." },
        input: { type: "object", description: "The model's input object, passed through unchanged to the prediction." },
        webhook: { type: "string", description: "Optional webhook URL to notify when the prediction completes." },
      },
      required: ["input"],
    },
  },
  {
    name: "get_prediction",
    description: "Fetch one prediction by ID, including its status and output.",
    inputSchema: {
      type: "object" as const,
      properties: { predictionId: { type: "string", description: "The identifier of the prediction to fetch." } },
      required: ["predictionId"],
    },
  },
  {
    name: "list_predictions",
    description: "List predictions for the account, one page at a time, with an optional pagination cursor.",
    inputSchema: {
      type: "object" as const,
      properties: { cursor: { type: "string", description: "Optional pagination cursor from a previous response to fetch the next page of predictions." } },
    },
  },
  {
    name: "cancel_prediction",
    description: "Cancel a running prediction by ID.",
    inputSchema: {
      type: "object" as const,
      properties: { predictionId: { type: "string", description: "The identifier of the running prediction to cancel." } },
      required: ["predictionId"],
    },
  },
  {
    name: "get_account",
    description: "Fetch the account that owns the configured Replicate API token.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "modelrun", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const fetchFn = globalThis.fetch as unknown as FetchFn;
  const apiKey = process.env.REPLICATE_API_TOKEN;
  try {
    let out: unknown;
    if (name === "list_models") {
      out = await listModels(fetchFn, apiKey, ListModelsArgs.parse(args ?? {}));
    } else if (name === "get_model") {
      out = await getModel(fetchFn, apiKey, GetModelArgs.parse(args ?? {}));
    } else if (name === "list_collections") {
      NoArgs.parse(args ?? {});
      out = await listCollections(fetchFn, apiKey);
    } else if (name === "get_collection") {
      out = await getCollection(fetchFn, apiKey, GetCollectionArgs.parse(args ?? {}));
    } else if (name === "list_model_versions") {
      out = await listModelVersions(fetchFn, apiKey, ListVersionsArgs.parse(args ?? {}));
    } else if (name === "get_model_version") {
      out = await getModelVersion(fetchFn, apiKey, GetVersionArgs.parse(args ?? {}));
    } else if (name === "create_prediction") {
      out = await createPrediction(fetchFn, apiKey, CreatePredictionArgs.parse(args ?? {}));
    } else if (name === "get_prediction") {
      out = await getPrediction(fetchFn, apiKey, PredictionIdArgs.parse(args ?? {}));
    } else if (name === "list_predictions") {
      out = await listPredictions(fetchFn, apiKey, ListPredictionsArgs.parse(args ?? {}));
    } else if (name === "cancel_prediction") {
      out = await cancelPrediction(fetchFn, apiKey, PredictionIdArgs.parse(args ?? {}));
    } else if (name === "get_account") {
      NoArgs.parse(args ?? {});
      out = await getAccount(fetchFn, apiKey);
    } else {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    return textResult(formatPayload(out));
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
