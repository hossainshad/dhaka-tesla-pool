import { Navigate, Route, Routes } from 'react-router'
import { useAuth } from './auth.jsx'
import Header from './components/Header.jsx'
import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import PassengerPage from './pages/PassengerPage.jsx'
import DriverPage from './pages/DriverPage.jsx'

function homePath(user) {
  if (!user) return '/login'
  return user.role === 'DRIVER' ? '/driver' : '/passenger'
}

function RequireRole({ role, children }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== role) return <Navigate to={homePath(user)} replace />
  return children
}

export default function App() {
  const { user, loading } = useAuth()

  if (loading) return <p className="center">Loading...</p>

  return (
    <>
      <Header />
      <main>
        <Routes>
          <Route path="/login" element={user ? <Navigate to={homePath(user)} replace /> : <LoginPage />} />
          <Route path="/register" element={user ? <Navigate to={homePath(user)} replace /> : <RegisterPage />} />
          <Route
            path="/passenger"
            element={
              <RequireRole role="PASSENGER">
                <PassengerPage />
              </RequireRole>
            }
          />
          <Route
            path="/driver"
            element={
              <RequireRole role="DRIVER">
                <DriverPage />
              </RequireRole>
            }
          />
          <Route path="*" element={<Navigate to={homePath(user)} replace />} />
        </Routes>
      </main>
    </>
  )
}
