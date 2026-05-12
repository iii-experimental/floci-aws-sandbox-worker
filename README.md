# Floci AWS Sandbox Worker

Standalone iii worker for interacting with a local [Floci](https://github.com/floci-io/floci) AWS emulator endpoint.

## Scope

This repo keeps Floci external: it does **not** vendor or port the emulator. It treats Floci as a local AWS-compatible endpoint, usually `http://127.0.0.1:4566`, and exposes iii functions that route safe AWS CLI operations to that endpoint.

Registered iii functions:

- `floci::health` — LocalStack-compatible health/readiness check.
- `floci::aws` — one allowlisted AWS CLI operation against Floci.
- `floci::smoke` — representative multi-service smoke check.

## Floci service parity

The worker allowlist now matches Floci's documented AWS emulator service surface from `floci-io/floci` commit `483a060` under `docs/services/`, mapped to AWS CLI service names:

- `acm`, `apigateway`, `apigatewayv2`, `appconfig`, `athena`, `autoscaling`, `backup`, `bedrock-runtime`
- `cloudformation`, `cloudwatch`, `codebuild`, `deploy`, `cognito-idp`, `cognito-identity`
- `dynamodb`, `ec2`, `ecr`, `ecs`, `eks`, `elasticache`, `elb`, `elbv2`, `events`
- `firehose`, `glue`, `iam`, `kinesis`, `kms`, `lambda`, `logs`, `kafka`, `opensearch`
- `rds`, `route53`, `s3`, `s3api`, `scheduler`, `secretsmanager`, `ses`, `sns`, `sqs`, `ssm`
- `stepfunctions`, `sts`, `textract`, `transfer`

Parity here means the iii worker can route all documented Floci service families through the AWS CLI endpoint safely. It does not mean every AWS operation has been exhaustively end-to-end tested; Floci remains the source of truth for per-operation behavior.

## Run

```bash
pnpm install
III_URL=ws://127.0.0.1:49134 FLOCI_ENDPOINT_URL=http://127.0.0.1:4566 pnpm start
```

## Test

```bash
pnpm test
pnpm type-check
pnpm build
```

## Boundaries

- Floci must be run separately, for example with `docker run --rm -p 4566:4566 floci/floci:latest`.
- This worker is intended for local emulator workflows only.
- `--profile` is blocked so invocations cannot switch into a developer's real AWS profile.
- `--cli-input-yaml` is blocked to keep request inputs explicit and inspectable.
- The worker uses an allowlist matching Floci's documented services, rather than exposing arbitrary shell execution.
