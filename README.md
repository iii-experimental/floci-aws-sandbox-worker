# Floci AWS Sandbox Worker

## Implementation Plan

1. Keep Floci external: do not vendor or port the Floci emulator into iii.
2. Treat Floci as a local AWS-compatible endpoint, usually `http://127.0.0.1:4566`.
3. Register a small iii external worker with focused functions:
   - `floci::health` for LocalStack-compatible health/readiness.
   - `floci::aws` for one allowlisted AWS CLI operation against Floci.
   - `floci::smoke` for a representative multi-service smoke check.
4. Keep scope representative of broad Floci AWS coverage without becoming a generic AWS shell proxy.
5. Validate command construction, service allowlisting, credential boundaries, and smoke-check composition with unit tests.

## Run

```bash
pnpm install
III_URL=ws://127.0.0.1:49134 FLOCI_ENDPOINT_URL=http://127.0.0.1:4566 pnpm start
```

## Boundaries

- Floci must be run separately, for example with `docker run --rm -p 4566:4566 floci/floci:latest`.
- This worker is intended for local emulator workflows only.
- `--profile` is blocked so invocations cannot switch into a developer's real AWS profile.
- The allowlist is intentionally small and can be expanded service-by-service when iii workflows need more Floci coverage.
