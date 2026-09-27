import { taka } from '../api.js'

export default function WaitingRequests({ online, ride, requests, busy, onAccept }) {
  let content

  if (!online) {
    content = <p className="muted">Go online to see ride requests.</p>
  } else if (ride && ride.status !== 'OPEN') {
    content = <p className="muted">Your group is closed for this ride.</p>
  } else if (requests.length === 0) {
    content = <p className="muted">No waiting requests right now.</p>
  } else {
    content = (
      <ul className="list">
        {requests.map((request) => (
          <li key={request.id}>
            <div>
              <div>
                <strong>{request.passengerName}</strong>: {request.pickupZone.name} → {request.dropoffZone.name}
              </div>
              <div className="muted">
                {request.seats} {request.seats === 1 ? 'seat' : 'seats'} · {request.distanceKm} km · est.{' '}
                {taka(request.estimatedFarePaisa)}
              </div>
            </div>
            <button onClick={() => onAccept(request.id)} disabled={busy}>
              Accept
            </button>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="card">
      <h2>{ride ? 'Requests that fit your ride' : 'Waiting requests'}</h2>
      {content}
    </div>
  )
}
