import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { FLOCI_DOCUMENTED_AWS_CLI_SERVICES, buildAwsArgs, readConfig } from '../src/floci.js'

const env = {
  FLOCI_ENDPOINT_URL: 'http://floci.test:4566/',
  AWS_REGION: 'us-west-2',
  AWS_ACCESS_KEY_ID: 'test-key',
  AWS_SECRET_ACCESS_KEY: 'test-secret',
}

const flociDocumentedAwsCliServices = [...FLOCI_DOCUMENTED_AWS_CLI_SERVICES]


describe('Floci documented AWS emulator service parity', () => {
  it('allows every AWS CLI service name that maps to Floci documented services', () => {
    const config = readConfig(env)
    const rejected: string[] = []

    for (const service of flociDocumentedAwsCliServices) {
      try {
        const args = buildAwsArgs(config, { service, operation: 'help', output: 'text' })
        assert.equal(args[4], service)
      } catch (error) {
        rejected.push(`${service}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    assert.deepEqual(rejected, [])
  })
})
