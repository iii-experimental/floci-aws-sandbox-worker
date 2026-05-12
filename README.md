# Floci AWS Sandbox Worker

An iii worker that wraps a local [Floci](https://github.com/floci-io/floci) AWS emulator and registers safe AWS sandbox functions with the iii Engine.

This is **not** a standalone HTTP API product.

The worker is a Node/TypeScript process because the current implementation uses `iii-sdk`. `pnpm` is only used to install dependencies and run the local worker process.

## What this worker does

Floci provides the local AWS-compatible endpoint, usually:

```text
http://127.0.0.1:4566
```

This repo keeps Floci external. It does not vendor, fork, or port the emulator.

The worker connects to a running iii Engine over `III_URL`, then registers iii functions that other iii workflows can discover and call.

```text
iii workflow / agent
        │
        ▼
iii Engine registry
        │ calls registered function
        ▼
floci-aws-sandbox worker
        │ runs allowlisted AWS CLI command
        ▼
local Floci AWS emulator
```

## Registered functions

- `floci::health`  
  Checks the LocalStack-compatible Floci health endpoint.

- `floci::aws`  
  Runs one allowlisted AWS CLI operation against the configured local Floci endpoint.

- `floci::smoke`  
  Runs a representative health + STS/S3/SQS smoke check.

## Why there is an endpoint URL

The endpoint is **Floci's local AWS emulator endpoint**, not this worker's public API surface.

The iii surface is the registered function list above. The worker uses `FLOCI_ENDPOINT_URL` only to know where the local emulator is running.

Default:

```text
FLOCI_ENDPOINT_URL=http://127.0.0.1:4566
```

## Requirements

- Node.js 20+
- `pnpm`
- AWS CLI available as `aws`
- A running iii Engine
- A running Floci container or binary on port `4566`

Start Floci separately:

```bash
docker run --rm -p 4566:4566 floci/floci:latest
```

## Run locally

Install dependencies:

```bash
pnpm install
```

Start the worker:

```bash
III_URL=ws://127.0.0.1:49134 \
FLOCI_ENDPOINT_URL=http://127.0.0.1:4566 \
pnpm start
```

On startup, the worker registers as:

```text
floci-aws-sandbox
```

## Example iii invocation

```ts
await iii.trigger({
  function_id: 'floci::aws',
  payload: {
    service: 'sqs',
    operation: 'list-queues',
  },
})
```

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `III_URL` | `ws://127.0.0.1:49134` | iii Engine websocket URL. |
| `FLOCI_WORKER_NAME` | `floci-aws-sandbox` | Worker name registered with iii. |
| `FLOCI_ENDPOINT_URL` | `http://127.0.0.1:4566` | Local Floci AWS emulator endpoint. |
| `FLOCI_AWS_COMMAND` | `aws` | AWS CLI executable. |
| `FLOCI_COMMAND_TIMEOUT_MS` | `10000` | Timeout for AWS CLI commands. |
| `FLOCI_INVOCATION_TIMEOUT_MS` | `30000` | iii worker invocation timeout. |
| `AWS_REGION` / `AWS_DEFAULT_REGION` | `us-east-1` | Region passed to AWS CLI. |
| `AWS_ACCESS_KEY_ID` | `test` | Local emulator credential. |
| `AWS_SECRET_ACCESS_KEY` | `test` | Local emulator credential. |

## Floci service parity

The worker allowlist matches Floci's documented AWS emulator service surface from `floci-io/floci` commit `483a060` under `docs/services/`, mapped to AWS CLI service names:

- `acm`, `apigateway`, `apigatewayv2`, `appconfig`, `athena`, `autoscaling`, `backup`, `bedrock-runtime`
- `cloudformation`, `cloudwatch`, `codebuild`, `deploy`, `cognito-idp`, `cognito-identity`
- `dynamodb`, `ec2`, `ecr`, `ecs`, `eks`, `elasticache`, `elb`, `elbv2`, `events`
- `firehose`, `glue`, `iam`, `kinesis`, `kms`, `lambda`, `logs`, `kafka`, `opensearch`
- `rds`, `route53`, `s3`, `s3api`, `scheduler`, `secretsmanager`, `ses`, `sns`, `sqs`, `ssm`
- `stepfunctions`, `sts`, `textract`, `transfer`

Parity here means the iii worker can route all documented Floci service families through the AWS CLI endpoint safely. It does not mean every AWS operation has been exhaustively end-to-end tested; Floci remains the source of truth for per-operation behavior.

## Safety boundaries

- This worker targets local Floci emulator workflows only, not production AWS.
- It does not start, manage, or bundle Floci.
- It does not expose arbitrary shell execution.
- AWS service names are allowlisted.
- AWS operation names must be single CLI operation tokens.
- `--profile` is blocked so calls cannot switch into a developer's real AWS profile.
- `--cli-input-yaml` is blocked to keep request inputs explicit and inspectable.
- Dummy local credentials default to `test` / `test`, the normal local-emulator pattern.

## Development

```bash
pnpm test
pnpm type-check
pnpm build
```
