import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import {login} from '@/lib/api'
import {useQueryClient} from '@tanstack/react-query'
import {useState} from 'react'

export function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const queryClient = useQueryClient()

  const isDark =
    typeof window !== 'undefined' &&
    (localStorage.getItem('theme') === 'dark' ||
      (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await login(password)
      queryClient.invalidateQueries({queryKey: ['auth-status']})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={isDark ? 'dark' : ''}>
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <img src="/logos/default-monochrome.svg" alt="Central Flock" className="h-8 mx-auto dark:hidden" />
            <img
              src="/logos/default-monochrome-white.svg"
              alt="Central Flock"
              className="h-8 mx-auto hidden dark:block"
            />
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading || !password}>
                {loading ? 'Signing in...' : 'Sign in'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
