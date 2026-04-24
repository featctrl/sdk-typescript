# Manual Tests — SSE Connection (`@featctrl/typescript`)

## Overview

This document covers manual test procedures for the `@featctrl/typescript` package.
Each test case verifies a specific aspect of the SSE connection lifecycle between the
TypeScript SDK and the FeatCtrl backend.

## Prerequisites

1. FeatCtrl backend running at `http://localhost:8082` (or the URL in `FEATCTRL_URL`)
2. A valid SDK key (create one via the FeatCtrl console and note the raw value)
3. `curl` available on the command line

---

## Test Case: TSSDK-001 — SSE connection established

| Field | Value |
|-------|-------|
| **Type** | ✅ Positive |
| **Priority** | P0 (Critical) |
| **Module** | SSE Client |
| **Auto Test** | `test_tssdk_001_connection_established` in `tests/integration/client_tests.ts` |

### Description

Verifies that the SDK can open an SSE connection to the FeatCtrl backend and receive the
`connection.established` event containing `connection_uuid` and `instance_uuid`.

### Prerequisites

- FeatCtrl backend running and reachable
- Valid SDK key `sk_live_xxx`

### Test Steps

1. Open an SSE connection using `curl`:

```bash
curl -N -H "Accept: text/event-stream" \
  "http://localhost:8082/sse?sdk_key=sk_live_xxx"
```

2. Observe the output.

### Expected Response

```
event: connection.established
data: {"connection_uuid":"<uuid>","instance_uuid":"<uuid>"}

event: flags.snapshot
data: {"flags":[...]}
```

### Pass/Fail Criteria

- [ ] `connection.established` event received within 5 seconds
- [ ] Response contains `connection_uuid` (non-empty UUID)
- [ ] Response contains `instance_uuid` (non-empty UUID)
- [ ] `flags.snapshot` event follows immediately after

---

## Test Case: TSSDK-002 — Flags snapshot received

| Field | Value |
|-------|-------|
| **Type** | ✅ Positive |
| **Priority** | P0 (Critical) |
| **Module** | SSE Client |
| **Auto Test** | `test_tssdk_002_flags_snapshot_populates_store` in `tests/integration/client_tests.ts` |

### Description

Verifies that after `connection.established`, the client receives `flags.snapshot`
containing the complete list of flags for the connected environment.

### Test Steps

1. Create at least one flag in the environment linked to your SDK key (via the FeatCtrl console).
2. Open the SSE connection (see TSSDK-001).
3. Observe the `flags.snapshot` event.

### Expected Response

```
event: flags.snapshot
data: {"flags":[{"key":"my-flag","name":"My Flag","flag_type":"boolean","enabled":true,"config":null}]}
```

### Pass/Fail Criteria

- [ ] `flags.snapshot` event received
- [ ] `flags` array contains all flags created for the environment
- [ ] Each flag has `key`, `name`, `flag_type`, `enabled`, and `config` fields

---

## Test Case: TSSDK-003 — Heartbeat acknowledgement

| Field | Value |
|-------|-------|
| **Type** | ✅ Positive |
| **Priority** | P0 (Critical) |
| **Module** | Heartbeat |
| **Auto Test** | `test_tssdk_001_connection_established` (heartbeat observed as side-effect) |

### Description

Verifies that the `heartbeat` event is received approximately every 60 seconds and
that the SDK ACKs it via `POST /heartbeat`.

### Test Steps

1. Open an SSE connection and note `connection_uuid` + `instance_uuid` from `connection.established`.
2. Wait ~60 seconds for the `heartbeat` event.
3. Manually ACK the heartbeat:

```bash
curl -X POST \
  "http://localhost:8082/heartbeat?connection_uuid=<conn_uuid>&instance_uuid=<inst_uuid>"
```

4. Verify the connection remains open (no eviction).

### Expected Response

```
event: heartbeat
data:
```

Heartbeat ACK: `HTTP 200 OK` or `HTTP 204 No Content`.

### Pass/Fail Criteria

- [ ] `heartbeat` event received with empty data field
- [ ] ACK POST returns 2xx
- [ ] Connection remains alive after ACK

---

## Test Case: TSSDK-004 — Clean disconnect

| Field | Value |
|-------|-------|
| **Type** | ✅ Positive |
| **Priority** | P1 (Important) |
| **Module** | SSE Client |
| **Auto Test** | *(manual only)* |

### Description

Verifies that calling `client.disconnect()` notifies the FeatCtrl backend,
allowing the server to release the connection slot immediately.

### Test Steps

1. Open an SSE connection and note `connection_uuid` + `instance_uuid`.
2. Manually POST to `/disconnect`:

```bash
curl -X POST \
  "http://localhost:8082/disconnect?connection_uuid=<conn_uuid>&instance_uuid=<inst_uuid>"
```

3. Verify the connection slot is released.

### Expected Response

`HTTP 200 OK` or `HTTP 204 No Content`.

### Pass/Fail Criteria

- [ ] POST `/disconnect` returns 2xx
- [ ] Existing SSE stream terminates (curl exits)

---

## Test Case: TSSDK-005 — Reconnect on network error

| Field | Value |
|-------|-------|
| **Type** | ✅ Positive |
| **Priority** | P1 (Important) |
| **Module** | SSE Client |
| **Auto Test** | *(manual only)* |

### Description

Verifies that the SDK automatically reconnects with exponential backoff when
the SSE connection is interrupted.

### Test Steps

1. Start the SDK process connected to the FeatCtrl backend.
2. Kill the FeatCtrl backend process or simulate a network interruption.
3. Observe the SDK logs for reconnection attempts.
4. Restart the FeatCtrl backend.
5. Verify the SDK reconnects and receives a fresh snapshot.

### Pass/Fail Criteria

- [ ] SDK logs a reconnection attempt after the disconnection
- [ ] Backoff delays increase: 3s → 6s → 12s → … → 30s (max)
- [ ] Backoff resets to 3s after successful reconnection
- [ ] Fresh `flags.snapshot` received after reconnection

---

## Execution Log

| Date | Tester | Result | Notes |
|------|--------|--------|-------|
| — | — | — | — |
