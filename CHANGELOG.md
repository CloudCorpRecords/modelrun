# Changelog

## 0.1.0 (2026-10-26)

- Initial release.
- CLI: `modelrun models|model|collections|collection|versions|version|predict|prediction|predictions|cancel|account`
  and `modelrun mcp`; the Replicate token is read from `REPLICATE_API_TOKEN`.
- MCP server (`modelrun mcp`, stdio) with eleven tools: `list_models`,
  `get_model`, `list_collections`, `get_collection`,
  `list_model_versions`, `get_model_version`, `create_prediction`,
  `get_prediction`, `list_predictions`, `cancel_prediction`, and
  `get_account`.
- Calls go to the Replicate API under `https://api.replicate.com/v1`
  with the token sent as an `Authorization: Bearer` header; HTTP
  failures surface the status plus Replicate's error title and detail.
- `create_prediction` accepts exactly one of a version ID or an
  official `model` (`owner/name`) plus a free-form `input` object.
- Replicate documents no search endpoint, so none is offered:
  discovery is `list_models` / `list_collections` plus `get_model`.
- A missing `REPLICATE_API_TOKEN` fails honestly with an error
  naming the variable, before any request is made.
- All HTTP goes through an injectable fetch function, so the test
  suite runs entirely on hand-written fixtures with no network access.
