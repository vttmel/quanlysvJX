# Logstream Backspace Normalization Design

## Context

Dashboard service logs show raw JX server terminal control characters. The problematic output contains repeated backspace bytes (`\b`, 0x08), for example progress counters that update in-place in a terminal. The current `LogsPanel` removes carriage returns and ANSI escape sequences, but does not interpret backspace, so the browser renders visible replacement glyphs and very long noisy lines.

## Goal

Render log output closer to terminal behavior by interpreting backspace characters before display. A sequence like `abc\b\b12` should display as `a12`.

## Scope

- Update the dashboard log display path only.
- Apply normalization to both initial static logs and realtime SSE chunks.
- Keep existing ANSI stripping, timestamp parsing, service coloring, tail behavior, and auto-follow behavior.
- Do not change Docker Compose, backend log collection, SSE envelope format, or service startup behavior.

## Design

Add a small frontend helper in `LogsPanel` that normalizes terminal backspace characters. The helper scans each chunk/string character-by-character, removes the previous output character when it sees `\b`, and otherwise appends the character. This produces terminal-like text without hiding normal log content.

Use the helper before splitting log payloads into lines:

- Static logs: normalize `logsQuery.data.logs`, then remove `\r`, then split by `\n`.
- Realtime logs: parse SSE JSON payload, normalize the chunk, then remove `\r`, then split by `\n`.

The existing `truncateLine` protection remains as a safety cap for unusually long lines.

## Error Handling

Malformed SSE payload handling remains unchanged through `parseLogChunk`. Backspace normalization is deterministic and does not throw for ordinary strings. Leading backspaces simply have no effect because there is no previous character to remove.

## Testing

Add a focused `LogsPanel` test that loads a mocked static log containing backspace characters and verifies the rendered text matches terminal behavior and does not include raw backspace glyphs.

## Approval Criteria

- JX progress-counter logs no longer show visible `\b` glyphs.
- Existing service name rendering still works.
- Static and realtime log paths use the same normalization behavior.
- Existing dashboard log tests still pass.
