import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="center-screen">
      <div>
        <div style={{ fontSize: 46 }}>🤷</div>
        <h2>Nothing here</h2>
        <p style={{ color: 'var(--muted)' }}>This event link doesn't exist or has ended.</p>
        <Link to="/" className="btn" style={{ display: 'inline-block', marginTop: 12, textDecoration: 'none' }}>
          Create your own
        </Link>
      </div>
    </div>
  );
}
