import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth.jsx'
import { errorText } from '../api.js'

export default function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(email, password)
    } catch (err) {
      setError(errorText(err))
      setSubmitting(false)
    }
  }

  return (
    <div className="card narrow">
      <h1>Log in</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="error">{error}</p>}
        <button disabled={submitting}>{submitting ? 'Logging in...' : 'Log in'}</button>
      </form>
      <p>
        New passenger? <Link to="/register">Create an account</Link>
      </p>
      <p className="muted">
        Demo accounts: nusrat, rafiq, shirin or jashim @teslapool.test, password oitesla123
      </p>
    </div>
  )
}
