import { taka } from '../api.js'

const NEXT_STEP = {
  OPEN: { path: '/driver/ride/arrive', label: 'Mark arrived' },
  DRIVER_ARRIVED: { path: '/driver/ride/start', label: 'Start trip' },
  STARTED: { path: '/driver/ride/complete', label: 'Complete trip' },
}

export default function CurrentRide({ ride, busy, onAction }) {
  const next = NEXT_STEP[ride.status]
  const canCancel = ride.status === 'OPEN' || ride.status === 'DRIVER_ARRIVED'

  return (
    <div className="card">
      <div className="row spread">
        <h2>Current ride</h2>
        <span className="badge">{ride.status.replace('_', ' ')}</span>
      </div>

      <p>
        Pickup: <strong>{ride.pickupZone.name}</strong> · Seats taken:{' '}
        <strong>
          {ride.seatsTaken} / {ride.capacity}
        </strong>
      </p>

      {ride.status === 'OPEN' && (
        <p className="muted">Passengers going your way can still join until you mark arrived.</p>
      )}

      <ul className="list">
        {ride.passengers.map((passenger) => (
          <li key={passenger.requestId}>
            <div>
              <div>
                <strong>{passenger.name}</strong> → {passenger.dropoffZone.name}
              </div>
              <div className="muted">
                {passenger.seats} {passenger.seats === 1 ? 'seat' : 'seats'} ·{' '}
                {passenger.paymentMethod === 'WALLET' ? 'TeslaPay' : 'Cash'}
              </div>
            </div>
            <div className="right">
              {passenger.finalFarePaisa
                ? taka(passenger.finalFarePaisa)
                : `est. ${taka(passenger.estimatedFarePaisa)}`}
            </div>
          </li>
        ))}
      </ul>

      <div className="row">
        {next && (
          <button onClick={() => onAction(next.path)} disabled={busy}>
            {next.label}
          </button>
        )}
        {canCancel && (
          <button
            className="danger"
            onClick={() => onAction('/driver/ride/cancel', 'Cancel this ride for all passengers?')}
            disabled={busy}
          >
            Cancel ride
          </button>
        )}
      </div>
    </div>
  )
}
