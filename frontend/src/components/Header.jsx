import { useAuth } from '../auth.jsx'

export default function Header() {
  const { user, logout } = useAuth()

  return (
    <header className="header">
      <strong>Dhaka Tesla Pool</strong>
      {user && (
        <div className="row">
          <span>
            {user.name} · {user.role === 'DRIVER' ? 'Driver' : 'Passenger'}
          </span>
          <button className="secondary" onClick={logout}>
            Log out
          </button>
        </div>
      )}
    </header>
  )
}
