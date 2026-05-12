export type FlociConfig = {
  endpointUrl: string
  region: string
  awsCommand: string
  accessKeyId: string
  secretAccessKey: string
  commandTimeoutMs: number
}

export type HealthInput = {
  endpointUrl?: string
}

export type HealthResult = {
  ok: boolean
  endpointUrl: string
  status: number
  services?: unknown
  error?: string
}

export type AwsCliInput = {
  service: string
  operation: string
  args?: string[]
  endpointUrl?: string
  region?: string
  output?: 'json' | 'text' | 'table'
  timeoutMs?: number
}

export type AwsCliResult = {
  service: string
  operation: string
  command: string[]
  stdout: string
  stderr: string
  json?: unknown
}

export type SmokeInput = {
  endpointUrl?: string
  region?: string
  timeoutMs?: number
}

export type SmokeResult = {
  ok: boolean
  endpointUrl: string
  checks: Array<{
    name: string
    ok: boolean
    result?: unknown
    error?: string
  }>
}

export type CommandExecutor = (
  command: string,
  args: string[],
  options: {
    env: NodeJS.ProcessEnv
    timeoutMs: number
  },
) => Promise<{ stdout: string; stderr: string }>

const DEFAULT_ENDPOINT_URL = 'http://127.0.0.1:4566'
const DEFAULT_REGION = 'us-east-1'
const DEFAULT_AWS_COMMAND = 'aws'
const DEFAULT_TIMEOUT_MS = 10_000

export const FLOCI_DOCUMENTED_AWS_CLI_SERVICES = [
  'acm',
  'apigateway',
  'apigatewayv2',
  'appconfig',
  'athena',
  'autoscaling',
  'backup',
  'bedrock-runtime',
  'cloudformation',
  'cloudwatch',
  'codebuild',
  'deploy',
  'cognito-idp',
  'cognito-identity',
  'dynamodb',
  'ec2',
  'ecr',
  'ecs',
  'eks',
  'elasticache',
  'elb',
  'elbv2',
  'events',
  'firehose',
  'glue',
  'iam',
  'kinesis',
  'kms',
  'lambda',
  'logs',
  'kafka',
  'opensearch',
  'rds',
  'route53',
  's3',
  's3api',
  'scheduler',
  'secretsmanager',
  'ses',
  'sns',
  'sqs',
  'ssm',
  'stepfunctions',
  'sts',
  'textract',
  'transfer',
] as const

const ALLOWED_SERVICES = new Set<string>(FLOCI_DOCUMENTED_AWS_CLI_SERVICES)

const BLOCKED_ARGS = new Set(['--profile', '--cli-input-yaml'])

export function readConfig(env: NodeJS.ProcessEnv = process.env): FlociConfig {
  return {
    endpointUrl: env.FLOCI_ENDPOINT_URL ?? DEFAULT_ENDPOINT_URL,
    region: env.AWS_REGION ?? env.AWS_DEFAULT_REGION ?? DEFAULT_REGION,
    awsCommand: env.FLOCI_AWS_COMMAND ?? DEFAULT_AWS_COMMAND,
    accessKeyId: env.AWS_ACCESS_KEY_ID ?? 'test',
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY ?? 'test',
    commandTimeoutMs: Number(env.FLOCI_COMMAND_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
  }
}

export function normalizeEndpointUrl(endpointUrl: string): string {
  return endpointUrl.replace(/\/+$/, '')
}

export function buildAwsArgs(config: FlociConfig, input: AwsCliInput): string[] {
  const service = input.service.trim()
  const operation = input.operation.trim()
  if (!ALLOWED_SERVICES.has(service)) {
    throw new Error(`AWS service "${service}" is not allowlisted for this Floci worker`)
  }
  if (!/^[a-z0-9-]+$/.test(operation)) {
    throw new Error(`AWS operation "${operation}" must be a single CLI operation token`)
  }

  const extraArgs = input.args ?? []
  for (const arg of extraArgs) {
    if (arg.includes('\0')) {
      throw new Error('AWS CLI arguments cannot contain NUL bytes')
    }
    if (BLOCKED_ARGS.has(arg)) {
      throw new Error(`AWS CLI argument "${arg}" is blocked; configure credentials through worker env instead`)
    }
  }

  return [
    '--endpoint-url',
    normalizeEndpointUrl(input.endpointUrl ?? config.endpointUrl),
    '--region',
    input.region ?? config.region,
    service,
    operation,
    ...extraArgs,
    '--output',
    input.output ?? 'json',
  ]
}

export async function health(input: HealthInput = {}, env: NodeJS.ProcessEnv = process.env): Promise<HealthResult> {
  const config = readConfig(env)
  const endpointUrl = normalizeEndpointUrl(input.endpointUrl ?? config.endpointUrl)
  const url = `${endpointUrl}/_localstack/health`
  try {
    const response = await fetch(url)
    const text = await response.text()
    let services: unknown = text
    try {
      services = text ? JSON.parse(text) : undefined
    } catch {
      // Floci/LocalStack-compatible health endpoints may return text in older modes.
    }
    return { ok: response.ok, endpointUrl, status: response.status, services }
  } catch (error) {
    return { ok: false, endpointUrl, status: 0, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function runAwsCli(
  input: AwsCliInput,
  executor: CommandExecutor,
  env: NodeJS.ProcessEnv = process.env,
): Promise<AwsCliResult> {
  const config = readConfig(env)
  const command = config.awsCommand
  const args = buildAwsArgs(config, input)
  const result = await executor(command, args, {
    timeoutMs: input.timeoutMs ?? config.commandTimeoutMs,
    env: {
      ...env,
      AWS_ACCESS_KEY_ID: config.accessKeyId,
      AWS_SECRET_ACCESS_KEY: config.secretAccessKey,
      AWS_DEFAULT_REGION: input.region ?? config.region,
    },
  })

  let json: unknown
  if ((input.output ?? 'json') === 'json' && result.stdout.trim()) {
    try {
      json = JSON.parse(result.stdout)
    } catch {
      // Preserve raw stdout when AWS CLI emits non-JSON errors or compatibility text.
    }
  }

  return {
    service: input.service,
    operation: input.operation,
    command: [command, ...args],
    stdout: result.stdout,
    stderr: result.stderr,
    ...(json === undefined ? {} : { json }),
  }
}

export async function smoke(
  input: SmokeInput,
  executor: CommandExecutor,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SmokeResult> {
  const endpointUrl = normalizeEndpointUrl(input.endpointUrl ?? readConfig(env).endpointUrl)
  const checks: SmokeResult['checks'] = []

  const healthResult = await health({ endpointUrl }, env)
  checks.push({ name: 'floci::health', ok: healthResult.ok, result: healthResult })

  for (const [name, request] of [
    ['sts::get-caller-identity', { service: 'sts', operation: 'get-caller-identity' }],
    ['s3::list-buckets', { service: 's3api', operation: 'list-buckets' }],
    ['sqs::list-queues', { service: 'sqs', operation: 'list-queues' }],
  ] as const) {
    try {
      const result = await runAwsCli(
        { ...request, endpointUrl, region: input.region, timeoutMs: input.timeoutMs },
        executor,
        env,
      )
      checks.push({ name, ok: true, result: result.json ?? result.stdout })
    } catch (error) {
      checks.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) })
    }
  }

  return { ok: checks.every((check) => check.ok), endpointUrl, checks }
}
