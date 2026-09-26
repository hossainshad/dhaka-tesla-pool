import { useState } from 'react'
import { api, errorText, taka } from '../api.js'

function statusMessage(request) {
  const ride = request.ride
  if (request.status === 'REQUESTED') return 'Looking for a Tesla...'
  if (request.status === 'MATCHED' && ride.status === 'DRIVER_ARRIVED') {
    return `${ride.driverName} has arrived in ${ride.vehicle.name}. Hop in!`
  }
  if (request.status === 'MATCHED') return `Matched! ${ride.driverName} is coming in ${ride.vehicle.name}.`
  if (request.status === 'IN_PROGRESS') return `On the way to ${request.dropoffZone.name}.`
  return request.status
}

export default function ActiveRequest({ request, onChange }) {
  const [error, setError] = useState('')
  const [cancelling, setCancelling] = useState(false)

  const canCancel = request.status === 'REQUESTED' || request.status === 'MATCHED'
  const otherPassengers = request.ride ? request.ride.passengerCount - 1 : 0

  async function handleCancel() {
    if (!window.confirm('Cancel this ride?')) return
    setError('')
    setCancelling(true)
    try {
      await api(`/ride-requests/${request.id}/cancel`, { method: 'POST' })
      await onChange()
    } catch (err) {
      setError(errorText(err))
      setCancelling(false)
    }
  }

  return (
    <div className="card">
      <div className="row spread">
        <h2>Your ride</h2>
        <span className="badge">{request.status.replace('_', ' ')}</span>
      </div>

      <p className="big">{statusMessage(request)}</p>

      <p>
        {request.pickupZone.name} → {request.dropoffZone.name} · {request.distanceKm} km · {request.seats}{' '}
        {request.seats === 1 ? 'seat' : 'seats'}
      </p>

      <p>
        {request.finalFarePaisa
          ? `Your fare: ${taka(request.finalFarePaisa)}`
          : `Estimated fare: ${taka(request.estimatedFarePaisa)}`}{' '}
        · {request.paymentMethod === 'WALLET' ? 'TeslaPay' : 'Cash'}
      </p>

      {otherPassengers > 0 && (
        <p className="muted">
          Sharing {request.ride.vehicle.name} with {otherPassengers} other{' '}
          {otherPassengers === 1 ? 'passenger' : 'passengers'}.
          {!request.finalFarePaisa && ' Your pool discount is applied when the ride starts.'}
        </p>
      )}

      {error && <p className="error">{error}</p>}

      {canCancel && (
        <button className="danger" onClick={handleCancel} disabled={cancelling}>
          {cancelling ? 'Cancelling...' : 'Cancel ride'}
        </button>
      )}
    </div>
  )
}
