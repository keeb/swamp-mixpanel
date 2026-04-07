---
name: mixpanel
description: Query Mixpanel analytics via the @keeb/mixpanel swamp extension model — event segmentation, saved Insights reports, funnels, retention cohorts, board/dashboard data, and funnel discovery against the Mixpanel Query API. Use when a user wants to pull Mixpanel data into swamp, wire Mixpanel results into a workflow, or configure a @keeb/mixpanel model. Triggers on "mixpanel", "@keeb/mixpanel", "event segmentation", "mixpanel funnel", "mixpanel retention", "mixpanel insights", "mixpanel board", "mixpanel dashboard", "query mixpanel", or any request involving Mixpanel service account credentials, project IDs, or the EU/US data residency regions.
---

# Mixpanel extension

The `@keeb/mixpanel` extension wraps the Mixpanel Query API (`/api/2.0/*` and
`/api/app/boards/*`) so swamp models can pull analytics data into the data
graph. One model type, six methods, six resources.

## Model type

`@keeb/mixpanel` — declared in `extensions/models/mixpanel.ts`.

### Global arguments (set per-instance, usually from a vault)

- `serviceAccountUsername` (string, required) — Mixpanel service account
  username.
- `serviceAccountSecret` (string, required) — Mixpanel service account secret.
- `projectId` (string, required) — Mixpanel project ID. Sent as `project_id` on
  every request.
- `region` (`"us"` | `"eu"`, default `"us"`) — picks
  `https://mixpanel.com/api/2.0` vs `https://eu.mixpanel.com/api/2.0`.

### Inputs schema

Top-level model inputs are `fromDate` and `toDate` (both `YYYY-MM-DD`). Most
methods also take their own `fromDate`/`toDate` arguments — model inputs are not
auto-applied to method args.

## Methods

All methods write to a single resource and return one data handle.

| Method            | Resource       | Required args                              | Optional args                 |
| ----------------- | -------------- | ------------------------------------------ | ----------------------------- |
| `segmentation`    | `segmentation` | `event`, `fromDate`, `toDate`              | `type`, `unit`, `on`, `where` |
| `query_insights`  | `insights`     | `bookmarkId`                               | —                             |
| `query_funnels`   | `funnels`      | `funnelId`, `fromDate`, `toDate`           | `unit`                        |
| `query_retention` | `retention`    | `fromDate`, `toDate`, `bornEvent`, `event` | `unit`                        |
| `list_funnels`    | `funnelsList`  | (none)                                     | —                             |
| `get_board`       | `board`        | `boardId`                                  | —                             |

### segmentation

- `type`: `general` (default) | `unique` | `average`.
- `unit`: `minute` | `hour` | `day` (default) | `week` | `month`.
- `on`: property to break down by. Plain names get auto-wrapped to
  `properties["name"]`. Pre-wrapped values starting with `properties[` are
  passed through verbatim.
- `where`: raw Mixpanel filter expression (passed straight to the API).

### query_funnels

`funnelId` is the numeric ID from Mixpanel. Use `list_funnels` first to discover
IDs.

### query_retention

`bornEvent` defines the cohort birth event; `event` is the return-activity
event. Both are required.

### get_board

Uses a different host path (`/api/app/boards/{boardId}`), not the `/api/2.0/*`
Query API. `boardId` comes from the Mixpanel dashboard URL.

## Resources

All six resources use `z.object({}).passthrough()` (the raw Mixpanel JSON is
stored as-is), `lifetime: "infinite"`, and `garbageCollection: 10`. Reach into
fields with CEL after the method runs.

## Configuration patterns

### Credentials via vault

Store the service account in a swamp vault and reference it in the model
definition. Never inline secrets.

```yaml
- name: mixpanel-prod
  type: "@keeb/mixpanel"
  globalArguments:
    serviceAccountUsername: "{{ vault.get('mixpanel/prod', 'username') }}"
    serviceAccountSecret: "{{ vault.get('mixpanel/prod', 'secret') }}"
    projectId: "1234567"
    region: "us"
  inputs:
    fromDate: "2026-04-01"
    toDate: "2026-04-06"
```

### Pulling a segmentation report in a workflow

```yaml
jobs:
  - name: signups-by-plan
    steps:
      - name: query
        model: mixpanel-prod
        method: segmentation
        arguments:
          event: "Signup Completed"
          fromDate: "2026-04-01"
          toDate: "2026-04-06"
          type: "unique"
          unit: "day"
          on: "plan"
          where: 'properties["country"] == "US"'
```

### Discovering funnel IDs then querying

```yaml
- name: list
  model: mixpanel-prod
  method: list_funnels
- name: query
  model: mixpanel-prod
  method: query_funnels
  arguments:
    funnelId: "98765"
    fromDate: "2026-04-01"
    toDate: "2026-04-06"
    unit: "day"
```

### Reading results with CEL

Use `data.latest(...)` (not the deprecated `model.<name>.resource...` form):

```
data.latest("mixpanel-prod", "segmentation").attributes.data.series
data.latest("mixpanel-prod", "funnels").attributes.meta.dates
data.latest("mixpanel-prod", "funnelsList").attributes
```

Because resource schemas are `passthrough()`, CEL paths must match the actual
Mixpanel response shape — inspect once with
`swamp model get mixpanel-prod --json` before wiring downstream steps.

## Gotchas

- **Method args are not inherited from model `inputs`.** The top-level
  `fromDate`/`toDate` inputs do not flow into `segmentation`, `query_funnels`,
  or `query_retention` automatically. Pass them explicitly on every method call.
- **`segmentation.on` auto-wrapping.** A plain string like `"plan"` becomes
  `properties["plan"]`. If you need an event-level field (e.g. `time`,
  `distinct_id`) or a `user.*` path, pre-format it as `properties["..."]`-style
  yourself or it will be wrapped incorrectly.
- **`segmentation.where` is raw.** The string is forwarded straight to Mixpanel;
  quoting is your problem. Use single quotes in YAML so `"..."` inside the
  expression survives.
- **`get_board` hits a different host.** It uses `/api/app/boards/...`, not
  `/api/2.0/...`. Service accounts still authenticate with HTTP Basic, but the
  endpoint is officially undocumented and may change.
- **Region is global, not per-call.** Switching between US and EU projects
  requires separate model instances.
- **All resources are `passthrough()` and `lifetime: "infinite"`.** Old data
  versions accumulate; rely on `garbageCollection: 10` (keeps the latest 10) or
  run `swamp data gc` periodically.
- **`projectId` is always appended as a query string param**, even on
  `get_board`. Make sure the service account actually has access to that project
  or you will get a 403 with an HTML body in the error message.
- **Dates are `YYYY-MM-DD` strings, not timestamps.** Mixpanel rejects ISO
  datetimes on these endpoints.
