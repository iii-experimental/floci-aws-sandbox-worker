import { spawn } from 'node:child_process'
import { registerWorker } from 'iii-sdk'
import { health, runAwsCli, smoke, type CommandExecutor } from './floci.js'

export const spawnExecutor: CommandExecutor = (command, args, options) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`Command timed out after ${options.timeoutMs}ms`))
    }, options.timeoutMs)

    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timeout)
      if (code === 0) {
        resolve({ stdout, stderr })
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with ${code}: ${stderr || stdout}`))
      }
    })
  })

const iiiUrl = process.env.III_URL ?? 'ws://127.0.0.1:49134'
const iii = registerWorker(iiiUrl, {
  workerName: process.env.FLOCI_WORKER_NAME ?? 'floci-aws-sandbox',
  invocationTimeoutMs: Number(process.env.FLOCI_INVOCATION_TIMEOUT_MS ?? 30_000),
})

iii.registerFunction('floci::health', async (input) => health(input), {
  description: 'Check the Floci LocalStack-compatible health endpoint.',
})

iii.registerFunction('floci::aws', async (input) => runAwsCli(input, spawnExecutor), {
  description: 'Run an allowlisted AWS CLI operation against the configured local Floci endpoint.',
})

iii.registerFunction('floci::smoke', async (input) => smoke(input, spawnExecutor), {
  description: 'Run a small health + STS/S3/SQS smoke check against Floci.',
})

console.log(`floci-aws-sandbox worker connected to ${iiiUrl}`)
