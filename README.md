# modelrun

modelrun is a small workbench for Replicate. It follows the shape of
the service: models live under an owner and a name, each model has
versions with their own input schemas, collections gather models
worth browsing, and a prediction is one run of a version — or of an
official model — with a free-form input object. From that shape
modelrun lists and reads models, walks collections and version
history, starts predictions, watches them, cancels them, and reports
the account the token belongs to. One binary serves a command-line
interface and a stdio MCP server.

A Replicate API token is required. Put it in the
`REPLICATE_API_TOKEN` environment variable; it is sent to the API as
an `Authorization: Bearer` header and never appears in output. When
the variable is missing, every call fails with an error that names
it, before any request is made.

Replicate documents no search endpoint, so modelrun offers none:
discovery is `list_models` and `list_collections`, narrowed by
reading the model you care about with `get_model`.

## Install

```bash
npx @reneturcios/modelrun models
```

Or run the container image:

```bash
docker run -i -e REPLICATE_API_TOKEN ghcr.io/cloudcorprecords/modelrun
```

The container defaults to the MCP server (see below). Pass CLI
arguments to use it as a CLI instead.

## CLI

```bash
export REPLICATE_API_TOKEN=<redacted>

modelrun models
modelrun model meta meta-llama-3-70b-instruct
modelrun collections
modelrun collection text-to-image
modelrun versions stability-ai sdxl
modelrun version stability-ai sdxl db21e45d3f7023abc2a46ee38c23973f6dce16bb082a930b0c49861f96d1e5bf
modelrun predict --model meta/meta-llama-3-70b-instruct '{"prompt":"Explain tides in one sentence."}'
modelrun predict --version db21e45d3f7023abc2a46ee38c23973f6dce16bb082a930b0c49861f96d1e5bf '{"prompt":"a lighthouse at dawn"}'
modelrun prediction zt3k9examplepredictionid
modelrun predictions
modelrun cancel zt3k9examplepredictionid
modelrun account

modelrun --version
```

Each command prints the upstream JSON payload. Exit codes: `0` on
success, `1` when a call fails (including a missing
`REPLICATE_API_TOKEN` or an API error), `2` for usage errors.

## MCP server

One bin serves both faces. The `mcp` subcommand starts a stdio MCP
server:

```bash
npx -y @reneturcios/modelrun mcp
```

MCP client configuration:

```json
{
  "mcpServers": {
    "modelrun": {
      "command": "npx",
      "args": ["-y", "@reneturcios/modelrun", "mcp"],
      "env": { "REPLICATE_API_TOKEN": "r8_..." }
    }
  }
}
```

### Tools

| Tool | Input | What it returns |
| --- | --- | --- |
| `list_models` | `cursor` (optional) | One page of models. |
| `get_model` | `owner`, `name` (required) | The model, with its description and latest version summary. |
| `list_collections` | (none) | The curated collections. |
| `get_collection` | `slug` (required) | The collection and the models it contains. |
| `list_model_versions` | `owner`, `name` (required) | The model's versions. |
| `get_model_version` | `owner`, `name`, `versionId` (required) | The version, with its input/output schema. |
| `create_prediction` | `input` (required), exactly one of `version` / `model`, `webhook` (optional) | The created prediction. |
| `get_prediction` | `predictionId` (required) | The prediction, with status and output. |
| `list_predictions` | `cursor` (optional) | One page of the account's predictions. |
| `cancel_prediction` | `predictionId` (required) | The canceled prediction. |
| `get_account` | (none) | The account that owns the token. |

All calls use the Replicate API under
`https://api.replicate.com/v1`. `create_prediction` passes the
`input` object through unchanged; for community models pass a
`version` ID, and for official models pass `model` as `owner/name` —
exactly one of the two, which the tool enforces before any request.

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # node test runner over test/*.test.ts, no network (fake fetch fixtures)
npm run dev     # run the CLI from source via tsx
```

## License

MIT — see `LICENSE`.
