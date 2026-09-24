# OfferPSP database changelog

## 2026-08-12 — Atomic replacement compatibility contract

- Restore the legacy `requires_override` response field in
  `private.offerpsp_validate_route_replacement`.
- Confirmed same-family replacements now return `requires_override: false`, so
  grouped merchant shortlist updates do not demand a false override reason.
- No data rewrite. The change only repairs the JSON contract between the
  atomic replacement validator and Impact Control bulk replacement workflow.

## 2026-08-12

- Prepared `offerpsp_route_coverage_mode_default_fix`: future imports preserve
  `global`, `regional`, `allowlist` and `global_except` coverage instead of
  inheriting the old `specific` column default. No existing commercial terms
  are rewritten automatically.
