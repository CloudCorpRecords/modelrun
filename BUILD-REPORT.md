# modelrun — Build Report

MCP Rebuild 100, Tier B. Clean-room rebuild of the Replicate MCP
server, built from the public Replicate API documentation captured
in `harness/fixtures/replicate-tools-original.json` only. The
fixture was created for this build from the public Replicate API
docs (docs.replicate.com / API reference: models, collections,
versions, predictions, account; fetched 2026-10-26), marked
`"_source": docs-derived ... not hand-probed`. Local build only —
nothing pushed or published, and no live network call was made or
claimed at any point.

Identity: repo `modelrun`, npm `@reneturcios/modelrun`,
MCP name `io.github.CloudCorpRecords/modelrun`, version `0.1.0`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json` — bin `modelrun: dist/cli.js`, `mcpName` set,
  scripts build=`tsc` / dev=`tsx src/cli.ts` / test=`tsx --test test/*.test.ts`
- `server.json` — description "Replicate models, collections,
  versions, and predictions: browse and run." = **73 chars**
  (≤100 ✓); npm entry carries `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/modelrun:0.1.0` carries **no**
  `version` field (verified programmatically)
- `Dockerfile` — node:20-alpine two-stage, ENTRYPOINT
  `node /app/dist/cli.js`, CMD `mcp`, label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/modelrun"`
- `tsconfig.json` (identical to the fleet template), `.gitignore`,
  `LICENSE` (MIT, Copyright (c) 2026 Rene Turcios), `README.md`
  (fresh text), `CHANGELOG.md` (single 0.1.0 entry, 2026-10-26)
- `src/index.ts`, `src/cli.ts` (`models`, `model`, `collections`,
  `collection`, `versions`, `version`, `predict`, `prediction`,
  `predictions`, `cancel`, `account`, `mcp`, `--version`; exit 2
  usage / 1 API error), `src/mcp.ts`, `src/types.ts`,
  `src/replicate.ts` (core logic, `VERSION = "0.1.0"`)
- `test/replicate.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (from the fleet template; image name and smoke-test server name
  changed to modelrun)

## Tools implemented (11)

`list_models`, `get_model`, `list_collections`, `get_collection`,
`list_model_versions`, `get_model_version`, `create_prediction`,
`get_prediction`, `list_predictions`, `cancel_prediction`,
`get_account` — the full documented set for the implemented
endpoints, as recorded in the fixture `_source`.

**Search — handled honestly:** Replicate documents **no public
search endpoint**, so no `search_models` tool exists here and none
was invented; discovery is `list_models` / `list_collections` plus
`get_model`. (The brief's optional `list_deployments` was not
included; deployments are outside this build's defined 11-tool
set, as noted in the fixture `_source`.)

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server` with explicit
  inputSchema literals, per the standing fleet rule: `McpServer`'s
  zod-to-JSON-Schema conversion injects `$schema` /
  `additionalProperties` keys that are absent from the public spec
  and break exact schema parity. Zod still validates every
  `tools/call`.
- Endpoints under `https://api.replicate.com/v1`: `GET /models`
  (cursor paging), `GET /models/{owner}/{name}`, `GET /collections`,
  `GET /collections/{slug}`, `GET /models/{owner}/{name}/versions`,
  `GET .../versions/{versionId}`, `POST /predictions`,
  `GET /predictions/{id}`, `GET /predictions`,
  `POST /predictions/{id}/cancel`, `GET /account`. The token from
  `REPLICATE_API_TOKEN` is sent as `Authorization: Bearer`; path
  segments are URL-encoded.
- `create_prediction` enforces the documented body contract:
  exactly one of `version` (a version ID) or `model` (an official
  model as `owner/name`) — both or neither is an error before any
  request — plus the required free-form `input` object, passed
  through unchanged, and an optional `webhook`.
- HTTP failures surface the status plus Replicate's `title` /
  `detail` when present. A missing token throws before any request,
  with an error naming `REPLICATE_API_TOKEN`; over MCP this
  surfaces as an `isError` result (verified live over stdio).
- All HTTP flows through an injectable `FetchFn` (types.ts). The
  test suite uses a fake fetch returning hand-written
  Replicate-shaped JSON fixtures — **no live call was performed**.

## Verification (foreground, exact outputs)

### 1. Build
```
$ ./node_modules/.bin/tsc ; echo exit=$?
tsc exit=0
```
`dist/` produced, including `dist/cli.js`. (First attempt hit
`Permission denied` on the copied `node_modules/.bin` and esbuild
binary — the `cp -r` of gridbase's tree dropped execute bits;
fixed with `chmod +x`, after which tsc and the test runner pass.
Recorded here so the publish wave is not surprised.)

### 2. Tests
```
$ ./node_modules/.bin/tsx --test test/*.test.ts
ℹ tests 11
ℹ pass 11
ℹ fail 0
```
Covers: missing/blank token error naming REPLICATE_API_TOKEN (and
no request made without a token), model list with Bearer header and
cursor, model/version path construction, collections list/get,
prediction creation from a version ID and from an official `model`
field (exact POST bodies asserted), the exactly-one-of
version/model rejection, prediction get/list/cancel paths and
method, account GET, and HTTP-404 errors carrying Replicate's
title and detail.

### 3. CLI / MCP smoke
`--version` → `0.1.0`; unknown command exits 2 with Usage. MCP
`initialize` over stdio → `serverInfo: {"name":"modelrun",
"version":"0.1.0"}`. A `tools/call` for `list_models` with
`REPLICATE_API_TOKEN` unset returned `isError: true` with text
"REPLICATE_API_TOKEN environment variable is required: set
REPLICATE_API_TOKEN to a Replicate API token and retry". Live API
calls were **not** run (no key, egress blocked).

### 4. Parity (harness, from ~/workspace/mcp-rebuild-100/harness/)
```
$ python3 parity.py --original fixtures/replicate-tools-original.json \
    --rebuild "stdio:node .../builds/modelrun/dist/cli.js mcp" \
    --out .../builds/modelrun/parity-out
verdict=PASS parity_pct=100.0 original_tools=11 rebuild_tools=11 missing=[] extra=[] schema_diffs=[]
(exit 0)
```
(parity.json: identical_tools 11/11.) Original side is tools-file
mode, so `fixture_results` records `SKIPPED-TOOLS-FILE-MODE` —
expected harness semantics, not an error.

## Lockfile status

`package-lock.json` was copied from gridbase's and its identity
fields edited (top-level `name`, root package `name`, root package
`bin` key → modelrun; dependency ranges are identical, so the tree
is unchanged). **Clean lockfile regen required before publish**
(regenerate with no `node_modules` present); do not publish from
this lockfile as-is. `node_modules` here is a copy of gridbase's;
`.bin/tsc` / `.bin/tsx` verified working after the chmod fix above.

## Gaps / honest notes

- No search tool: Replicate documents no public search endpoint
  (see Tools section). If a future brief insists on one, it would
  have to be a list + client-side filter and labelled as such —
  deliberately not shipped as a fake endpoint here.
- Deployments endpoints (`/deployments`) exist upstream but are
  outside this build's defined set; adding them later is additive.
- No live Replicate call was made (VM egress is blocked and no
  token is available in this environment). Request construction is
  written against the documented API paths and payload shapes; live
  payload drift is unverified until the publish wave can smoke with
  a real token. Behaviour parity is tool/schema + docs-contract,
  not live-proven.
- Prediction outputs can be files/URLs; modelrun returns the
  upstream prediction object as-is (no output downloading), matching
  the documented API response contract.
- Container build not exercised locally; the publish-container
  workflow smoke-tests the image at publish time.
