import { useEffect, useState } from 'react'
import { api, errorText, taka } from '../api.js'

export default function RequestForm({ zones, balance, onCreated }) {
  const [pickupZoneId, setPickupZoneId] = useState('')
  const [dropoffZoneId, setDropoffZoneId] = useState('')
  const [seats, setSeats] = useState('1')
  const [paymentMethod, setPaymentMethod] = useState('CASH')
  const [estimate, setEstimate] = useState(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const tripChosen = pickupZoneId && dropoffZoneId && pickupZoneId !== dropoffZoneId
  const shownEstimate = tripChosen ? estimate : null
  const walletTooLow =
    paymentMethod === 'WALLET' && shownEstimate && shownEstimate.estimatedFarePaisa > balance

  useEffect(() => {
    if (!tripChosen) return
    let ignore = false
    const query = new URLSearchParams({ pickupZoneId, dropoffZoneId, seats })
    api(`/ride-requests/estimate?${query}`)
      .then((data) => {
        if (!ignore) setEstimate(data.estimate)
      })
      .catch((err) => {
        if (!ignore) setError(errorText(err))
      })
    return () => {
      ignore = true
    }
  }, [tripChosen, pickupZoneId, dropoffZoneId, seats])

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await api('/ride-requests', {
        method: 'POST',
        body: {
          pickupZoneId: Number(pickupZoneId),
          dropoffZoneId: Number(dropoffZoneId),
          seats: Number(seats),
          paymentMethod,
        },
      })
      await onCreated()
    } catch (err) {
      setError(errorText(err))
      setSubmitting(false)
    }
  }

  return (
    <div className="card">
      <h2>Request a ride</h2>
      <form onSubmit={handleSubmit}>
        <label>
          Pickup
          <select value={pickupZoneId} onChange={(e) => setPickupZoneId(e.target.value)} required>
            <option value="">Choose a zone</option>
            {zones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Destination
          <select value={dropoffZoneId} onChange={(e) => setDropoffZoneId(e.target.value)} required>
            <option value="">Choose a zone</option>
            {zones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.name}
              </option>
            ))}
          </select>
        </label>

        <div className="row">
          <label>
            Seats
            <select value={seats} onChange={(e) => setSeats(e.target.value)}>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
            </select>
          </label>

          <label>
            Payment
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="CASH">Cash</option>
              <option value="WALLET">TeslaPay</option>
            </select>
          </label>
        </div>

        {pickupZoneId && pickupZoneId === dropoffZoneId && (
          <p className="error">Pickup and destination must be different.</p>
        )}

        {shownEstimate && (
          <div className="estimate">
            <div>
              {shownEstimate.distanceKm} km · Estimated fare <strong>{taka(shownEstimate.estimatedFarePaisa)}</strong>
            </div>
            <div className="muted">
              Only {taka(shownEstimate.pooledFarePaisa)} if someone shares your Tesla.
            </div>
          </div>
        )}

        {walletTooLow && <p className="error">Your TeslaPay balance is too low for this ride. Choose cash.</p>}
        {error && <p className="error">{error}</p>}

        <button disabled={!tripChosen || walletTooLow || submitting}>
          {submitting ? 'Requesting...' : 'Request ride'}
        </button>
      </form>
    </div>
  )
}
