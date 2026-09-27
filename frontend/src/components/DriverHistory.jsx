import { taka } from '../api.js'

export default function DriverHistory({ rides }) {
  return (
    <div className="card">
      <h2>Ride history</h2>
      {rides.length === 0 ? (
        <p className="muted">No finished rides yet.</p>
      ) : (
        <ul className="list">
          {rides.map((ride) => (
            <li key={ride.id}>
              <div>
                <div>
                  From {ride.pickupZone.name} · {ride.passengers.map((p) => p.name).join(', ')}
                </div>
                <div className="muted">{new Date(ride.createdAt).toLocaleString()}</div>
              </div>
              <div className="right">
                <span className={ride.status === 'COMPLETED' ? 'badge' : 'badge grey'}>{ride.status}</span>
                <div>{ride.status === 'COMPLETED' ? taka(ride.totalFarePaisa) : '–'}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
