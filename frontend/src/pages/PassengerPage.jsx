import { useCallback, useEffect, useState } from 'react'
import { api, errorText, taka } from '../api.js'
import { useAuth } from '../auth.jsx'
import RequestForm from '../components/RequestForm.jsx'
import ActiveRequest from '../components/ActiveRequest.jsx'
import RequestHistory from '../components/RequestHistory.jsx'

const ACTIVE_STATUSES = ['REQUESTED', 'MATCHED', 'IN_PROGRESS']

export default function PassengerPage() {
  const { user } = useAuth()
  const [zones, setZones] = useState([])
  const [requests, setRequests] = useState([])
  const [balance, setBalance] = useState(user.walletBalancePaisa)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadRequests = useCallback(async () => {
    try {
      const [me, list] = await Promise.all([api('/auth/me'), api('/ride-requests')])
      setBalance(me.user.walletBalancePaisa)
      setRequests(list.requests)
      setError('')
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    api('/zones')
      .then((data) => setZones(data.zones))
      .catch((err) => setError(errorText(err)))
  }, [])

  useEffect(() => {
    loadRequests()
    const timer = setInterval(loadRequests, 5000)
    return () => clearInterval(timer)
  }, [loadRequests])

  if (loading) return <p className="center">Loading your rides...</p>

  const activeRequest = requests.find((r) => ACTIVE_STATUSES.includes(r.status))
  const pastRequests = requests.filter((r) => !ACTIVE_STATUSES.includes(r.status))

  return (
    <>
      <div className="card row spread">
        <h1>Hi {user.name}</h1>
        <span>
          TeslaPay balance: <strong>{taka(balance)}</strong>
        </span>
      </div>

      {error && <p className="card error">{error}</p>}

      {activeRequest ? (
        <ActiveRequest request={activeRequest} onChange={loadRequests} />
      ) : (
        <RequestForm zones={zones} balance={balance} onCreated={loadRequests} />
      )}

      <RequestHistory requests={pastRequests} />
    </>
  )
}
