import { useState } from 'react';
import { api } from '../lib/api.js';
import Icon from './Icon.jsx';

export default function Invite({ event, isHost, adminToken, onToast }) {
  const [copied, setCopied] = useState(false);
  const url = event.joinUrl || `${window.location.origin}/e/${event.id}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      onToast?.('คัดลอกลิงก์แล้ว');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      onToast?.('คัดลอกไม่ได้ — กดค้างที่ลิงก์');
    }
  }

  async function shareLink() {
    try {
      if (navigator.share) {
        await navigator.share({ title: event.name, text: `เข้าร่วมอัลบั้มงาน "${event.name}"`, url });
      } else {
        copy();
      }
    } catch {
      /* cancelled */
    }
  }

  return (
    <div className="invite">
      <h2 style={{ margin: '4px 0 4px' }}>
        เชิญ <span style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', color: 'var(--accent-strong)' }}>เพื่อน</span>
      </h2>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>ให้แขกสแกนเพื่อเข้าร่วม ไม่ต้องดาวน์โหลดแอป</p>

      <div className="qr-card">
        <img src={api.qrUrl(event.id)} alt="สแกนเพื่อเข้าร่วมกล้องอีเวนต์" />
        <div className="no-dl">ไม่ต้องติดตั้งแอป</div>
      </div>

      <div className="link-row">
        <input type="text" readOnly value={url} onFocus={(e) => e.target.select()} />
        <button className="btn secondary icon-btn" style={{ width: 'auto', padding: '0 16px' }} onClick={copy}>
          {copied ? <Icon name="check" size={18} /> : <Icon name="copy" size={18} />}
        </button>
      </div>

      <button className="btn icon-btn" onClick={shareLink}>
        <Icon name="share" size={18} /> แชร์ลิงก์
      </button>

      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 20 }}>
        ทุกคนที่มีลิงก์นี้เข้าดูอัลบั้มและเพิ่มรูปได้ — แชร์ให้เฉพาะแขกของคุณ
      </p>

      {isHost && (
        <div className="host-panel">
          <span className="host-tag"><Icon name="shield" size={14} /> สิทธิ์เจ้าภาพ</span>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 0 }}>
            ดาวน์โหลดรูปทั้งงานเป็น ZIP หรือลบรูปใดก็ได้ (แตะรูปแล้วกดถังขยะ)
          </p>
          <a
            className="btn icon-btn"
            href={api.downloadAllUrl(event.id, adminToken)}
            style={{ display: 'inline-flex', width: '100%', textDecoration: 'none', justifyContent: 'center' }}
          >
            <Icon name="download" size={18} /> ดาวน์โหลดทั้งงาน (.zip)
          </a>
        </div>
      )}
    </div>
  );
}
