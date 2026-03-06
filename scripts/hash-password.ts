import bcrypt from 'bcryptjs'
import readline from 'readline'

const rl = readline.createInterface({input: process.stdin, output: process.stdout})

rl.question('Enter password to hash: ', async (password) => {
  if (!password) {
    console.error('Password cannot be empty')
    process.exit(1)
  }
  const hash = await bcrypt.hash(password, 10)
  console.log('\nAdd this to your .env file:')
  console.log(`AUTH_PASSWORD_HASH=${hash}`)
  rl.close()
})
