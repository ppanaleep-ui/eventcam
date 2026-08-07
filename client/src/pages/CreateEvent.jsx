import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { setGuestName } from '../lib/guest.js';
import { addMyEvent } from '../lib/admin.js';
import { FILMS } from '../lib/filters.js';
import Icon from '../components/Icon.jsx';

// Full-screen "create & configure event" flow (opened from the dashboard).
export default function CreateEvent({ onClose }) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [endsLocal, setEndsLocal] = useState(''); // datetime-local string
  const [reveal, setReveal] = useState('instant'); // instant | after
  const [filterId, setFilterId] = useState('kodak'); // host default; guests can change
  const [guestsCanView, setGuestsCanView] = useState(true);
  const [pickFilter, setPickFilter] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const filmName = FILMS.find((f) => f.id === filterId)?.name || 'No filter';
  const endsAt = endsLocal ? Date.parse(endsLocal) : null;
  const needsEnd = reveal === 'after' && !endsAt;

  async function create() {
    if (needsEnd) { setError('Add an end time so guests know when photos appear.'); return; }
    setBusy(true);
    setError('');
    try {
      const ev = await api.createEvent({
        name: name.trim() || 'My event',
        defaultFilter: filterId,
        guestsCanView,
        reveal,
        endsAt: endsAt || undefined,
      });
      addMyEvent({ id: ev.id, token: ev.adminToken, name: ev.name });
      if (ev.hostName) setGuestName(ev.hostName);
      navigate(`/e/${ev.id}?invite=1`);
    } catch (err) {
      setError(err.message || 'Could not create the event');
      setBusy(false);
    }
  }

  return (
    <div className="cfg">
      <header className="cfg-top">
        <button className="cfg-back" onClick={onClose} aria-label="Back"><Icon name="chevronLeft" size={22} /></button>
        <h1>Create event</h1>
        <span style={{ width: 40 }} />
      </header>

      <div className="cfg-body">
        <label className="cfg-name">
          <span>Event name</span>
          <input
            type="text"
            placeholder="e.g. Karntida ♥ Krisada Wedding"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            autoFocus
          />
        </label>

        <div className="cfg-row">
          <div className="cfg-row-main">
            <span className="cfg-ic"><Icon name="clock" size={20} /></span>
            <div className="cfg-row-text">
              <b>Ends</b>
              <span>{endsAt ? new Date(endsAt).toLocaleString() : 'Optional'}</span>
            </div>
          </div>
          <input
            className="cfg-datetime"
            type="datetime-local"
            value={endsLocal}
            onChange={(e) => setEndsLocal(e.target.value)}
            aria-label="Event end time"
          />
        </div>

        <div className="cfg-row column">
          <div className="cfg-row-main">
            <span className="cfg-ic"><Icon name="images" size={20} /></span>
            <div className="cfg-row-text">
              <b>Reveal photos</b>
              <span>{reveal === 'after' ? 'Guests see photos after it ends' : 'Everyone sees photos live'}</span>
            </div>
          </div>
          <div className="mini-seg wide">
            {[['instant', 'Instantly'], ['after', 'After it ends']].map(([v, l]) => (
              <button key={v} className={reveal === v ? 'on' : ''} onClick={() => setReveal(v)}>{l}</button>
            ))}
          </div>
        </div>

        <button className="cfg-row tappable" onClick={() => setPickFilter(true)}>
          <div className="cfg-row-main">
            <span className="cfg-ic"><Icon name="sliders" size={20} /></span>
            <div className="cfg-row-text">
              <b>Default film</b>
              <span>Guests can still change it while shooting</span>
            </div>
          </div>
          <span className="cfg-value">{filmName} <Icon name="chevronRight" size={18} /></span>
        </button>

        <div className="cfg-row">
          <div className="cfg-row-main">
            <span className="cfg-ic"><Icon name="images" size={20} /></span>
            <div className="cfg-row-text">
              <b>Guests can view the album</b>
              <span>{guestsCanView ? 'On — everyone can browse' : 'Off — only you can view'}</span>
            </div>
          </div>
          <button className={`mini-toggle ${guestsCanView ? 'on' : ''}`} onClick={() => setGuestsCanView((v) => !v)} aria-label="Guests can view the album"><i /></button>
        </div>

        {error && <p className="cfg-err">{error}</p>}
      </div>

      <div className="cfg-foot">
        <button className="pc-cta" onClick={create} disabled={busy}>
          {busy ? 'Creating…' : 'Continue'}
        </button>
      </div>

      {pickFilter && (
        <div className="pc-sheet-scrim" onClick={() => setPickFilter(false)}>
          <div className="pc-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="pc-sheet-grip" />
            <h2>Default film</h2>
            <p>The look guests start with. They can switch anytime in the camera.</p>
            <div className="film-list">
              {FILMS.map((f) => (
                <button
                  key={f.id}
                  className={`film-opt ${filterId === f.id ? 'on' : ''}`}
                  onClick={() => { setFilterId(f.id); setPickFilter(false); }}
                >
                  {f.name}
                  {filterId === f.id && <Icon name="check" size={18} strokeWidth={3} />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
