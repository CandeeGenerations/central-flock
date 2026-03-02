import {spawn} from 'node:child_process'

const runCommand = async (name: string, command: string[]): Promise<void> => {
  console.log(`Running ${name}...`)

  const [cmd, ...args] = command
  if (!cmd) {
    throw new Error('Command cannot be empty')
  }
  const exitCode = await new Promise<number | null>((resolve) => {
    const childProcess = spawn(cmd, args, {
      cwd: process.cwd(),
      stdio: 'inherit',
    })
    childProcess.on('close', resolve)
  })

  if (exitCode !== 0) {
    console.error(`${name} failed with exit code ${exitCode}`)
    throw new Error(`${name} failed`)
  }

  console.log(`${name} completed successfully`)
}

const main = async (): Promise<void> => {
  try {
    console.log('Running quality checks...')

    await runCommand('eslint', ['pnpm', 'run', 'eslint'])
    await runCommand('prettier', ['pnpm', 'run', 'prettier:ci'])

    console.log('All quality checks passed!')
    process.exit(0)
  } catch {
    process.exit(2)
  }
}

main()
