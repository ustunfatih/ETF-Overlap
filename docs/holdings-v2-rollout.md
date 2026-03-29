# ETF Holdings V2 Rollout (Safe / Non-Breaking)

This project now supports a **feature-flagged** V2 holdings path intended to run in parallel with the existing behavior.

## Default behavior

All V2 functionality is disabled by default, so the current app behavior remains unchanged until flags are explicitly enabled.

## Environment variables

- `ETF_HOLDINGS_V2_ENABLED` (default `false`)
- `ETF_PROVIDER_ALPHA_ENABLED` (default `false`)
- `ALPHA_VANTAGE_API_KEY` (required when alpha provider enabled)
- `ETF_PROVIDER_ISSUER_ENABLED` (reserved, default `false`)
- `ETF_PROVIDER_SEC_ENABLED` (reserved, default `false`)
- `ETF_ADMIN_AUTH_ENABLED` (default `false`)
- `ADMIN_API_KEY` (required when admin auth enabled)
- `HOLDINGS_TTL_HOURS` (default `1`)

## Rollback

Fast rollback: set `ETF_HOLDINGS_V2_ENABLED=false` and redeploy.

Auth rollback (if needed): set `ETF_ADMIN_AUTH_ENABLED=false`.

## Diagnostics

- `GET /api/admin/holdings/v2/status`

Returns current provider/flag status for operational visibility.
