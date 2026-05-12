import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildAwsArgs, readConfig, runAwsCli, smoke, type CommandExecutor } from '../src/floci.js'

const env = {
  FLOCI_ENDPOINT_URL: 'http://floci.test:4566/',
  AWS_REGION: 'us-west-2',
  AWS_ACCESS_KEY_ID: 'test-key',
  AWS_SECRET_ACCESS_KEY: 'test-secret',
}

describe('floci aws sandbox worker helpers', () => {
  it('builds AWS CLI arguments for an allowlisted Floci service', () => {
    const args = buildAwsArgs(readConfig(env), {
      service: 'sqs',
      operation: 'list-queues',
      args: ['--queue-name-prefix', 'orders'],
    })

    assert.deepEqual(args, [
      '--endpoint-url',
      'http://floci.test:4566',
      '--region',
      'us-west-2',
      'sqs',
      'list-queues',
      '--queue-name-prefix',
      'orders',
      '--output',
      'json',
    ])
  })

  it('rejects non-allowlisted services', () => {
    assert.throws(
      () =>
        buildAwsArgs(readConfig(env), {
          service: 'organizations',
          operation: 'list-accounts',
        }),
      /not allowlisted/,
    )
  })

  it('rejects profile switching so credentials remain worker-scoped', () => {
    assert.throws(
      () =>
        buildAwsArgs(readConfig(env), {
          service: 's3api',
          operation: 'list-buckets',
          args: ['--profile', 'prod'],
        }),
      /blocked/,
    )
  })

  it('parses JSON output from the injected AWS command executor', async () => {
    const calls: string[][] = []
    const executor: CommandExecutor = async (command, args) => {
      calls.push([command, ...args])
      return { stdout: '{"Queues":[]}', stderr: '' }
    }

    const result = await runAwsCli(
      {
        service: 'sqs',
        operation: 'list-queues',
      },
      executor,
      env,
    )

    assert.deepEqual(result.json, { Queues: [] })
    assert.equal(calls[0]?.[0], 'aws')
    assert.ok(calls[0]?.includes('http://floci.test:4566'))
  })

  it('keeps smoke checks representative of broad AWS while narrow', async () => {
    const executor: CommandExecutor = async (_command, args) => ({
      stdout: JSON.stringify({ service: args[4], operation: args[5] }),
      stderr: '',
    })

    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ services: { s3: 'running', sqs: 'running', sts: 'running' } }), {
        status: 200,
      })) as typeof fetch
    try {
      const result = await smoke({ endpointUrl: 'http://floci.test:4566' }, executor, env)
      assert.equal(result.ok, true)
      assert.deepEqual(
        result.checks.map((check) => check.name),
        ['floci::health', 'sts::get-caller-identity', 's3::list-buckets', 'sqs::list-queues'],
      )
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
