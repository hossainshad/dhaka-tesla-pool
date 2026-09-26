import { taka } from '../api.js'

export default function RequestHistory({ requests }) {
  return (
    <div className="card">
      <h2>Ride history</h2>
      {requests.length === 0 ? (
        <p className="muted">No past rides yet.</p>
      ) : (
        <ul className="list">
          {requests.map((request) => (
            <li key={request.id}>
              <div>
                <div>
                  {request.pickupZone.name} → {request.dropoffZone.name}
                </div>
                <div className="muted">{new Date(request.createdAt).toLocaleString()}</div>
              </div>
              <div className="right">
                <span className={request.status === 'COMPLETED' ? 'badge' : 'badge grey'}>{request.status}</span>
                <div>{request.status === 'COMPLETED' ? taka(request.finalFarePaisa) : '–'}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
