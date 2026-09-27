import { useCallback, useEffect, useState } from 'react'
import { api, errorText } from '../api.js'
import { useAuth } from '../auth.jsx'
import CurrentRide from '../components/CurrentRide.jsx'
import WaitingRequests from '../components/WaitingRequests.jsx'
import DriverHistory from '../components/DriverHistory.jsx'

export default function DriverPage() {
  const { user } = useAuth()
  const [online, setOnline] = useState(user.isOnline)
  const [vehicle, setVehicle] = useState(user.vehicle)
  const [ride, setRide] = useState(null)
  const [requests, setRequests] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [me, current, past] = await Promise.all([
        api('/auth/me'),
        api('/driver/ride'),
        api('/driver/rides'),
      ])
      const waiting = me.user.isOnline ? await api('/driver/requests') : { requests: [] }
      setOnline(me.user.isOnline)
      setVehicle(me.user.vehicle)
      setRide(current.ride)
      setHistory(past.rides)
      setRequests(waiting.requests)
      setError('')
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, 5000)
    return () => clearInterval(timer)
  }, [load])

  async function send(path, method = 'POST', body) {
    setError('')
    setBusy(true)
    try {
      await api(path, { method, body })
      await load()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  function toggleOnline() {
    send('/driver/status', 'PATCH', { isOnline: !online })
  }

  function rideAction(path, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return
    send(path)
  }

  function accept(requestId) {
    send(`/driver/requests/${requestId}/accept`)
  }

  if (loading) return <p className="center">Loading your dashboard...</p>

  return (
    <>
      <div className="card row spread">
        <div>
          <h1>Hi {user.name}</h1>
          {vehicle && (
            <span className="muted">
              {vehicle.name} · {vehicle.plateNumber} · {vehicle.capacity} seats
            </span>
          )}
        </div>
        <div className="row">
          <span className={online ? 'badge' : 'badge grey'}>{online ? 'Online' : 'Offline'}</span>
          <button className={online ? 'secondary' : ''} onClick={toggleOnline} disabled={busy}>
            {online ? 'Go offline' : 'Go online'}
          </button>
        </div>
      </div>

      {error && <p className="card error">{error}</p>}

      {ride && <CurrentRide ride={ride} busy={busy} onAction={rideAction} />}

      <WaitingRequests online={online} ride={ride} requests={requests} busy={busy} onAccept={accept} />

      <DriverHistory rides={history} />
    </>
  )
}
