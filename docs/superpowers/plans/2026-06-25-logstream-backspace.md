# Logstream Backspace Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make dashboard logstream render `\b` backspace bytes like a terminal so JX progress counters stop showing visible garbage glyphs.

**Architecture:** Keep the fix inside `LogsPanel` because the issue is display-specific. Split chunks into lines, preserve Docker Compose service prefixes like `jxserver | `, then normalize backspaces only in the log payload. Apply the same path to both static `getLogs` payloads and realtime SSE chunks.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, TanStack Query, Mantine.

---

### Task 1: Cover Backspace Rendering

**Files:**
- Modify: `apps/ui/src/views/dashboard/components/LogsPanel.test.tsx`
- Validate: `apps/ui/src/views/dashboard/components/LogsPanel.tsx`

- [x] **Step 1: Write the failing test**

Test `jxserver | abc\b\b12\n` renders as `a12` and viewport text does not contain `\b`.

- [x] **Step 2: Add real jxserver counter regression**

Test `\b` repeated six times with six-digit progress counters collapses to the final counter while preserving the service prefix.

### Task 2: Normalize Static And Stream Logs

**Files:**
- Modify: `apps/ui/src/views/dashboard/components/LogsPanel.tsx`
- Test: `apps/ui/src/views/dashboard/components/LogsPanel.test.tsx`

- [x] **Step 1: Add helpers**

Add `normalizeLogChunk`, `applyBackspacesToLogContent`, and `applyBackspaces` near existing log helpers.

- [x] **Step 2: Use helper for static logs**

Call `normalizeLogChunk(logsQuery.data.logs)` before updating `logs` state.

- [x] **Step 3: Use helper for realtime chunks**

Call `normalizeLogChunk(chunk)` after parsing each SSE event.

- [x] **Step 4: Run focused tests**

Run: `npm --workspace apps/ui run vitest -- LogsPanel.test.tsx`
Expected: PASS for all `LogsPanel` tests.

## Self-Review

- Spec coverage: static logs, realtime SSE logs, terminal-like `\b`, real six-digit JX counter, no backend/SSE format change are covered.
- Placeholder scan: no placeholders remain.
- Type consistency: `normalizeLogChunk` returns `string[]`; `applyBackspaces` accepts and returns `string`; existing `logs` state remains `string[]`.
