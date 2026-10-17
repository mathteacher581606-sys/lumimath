'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useRouter } from 'next/navigation';
import BackButton from '@/components/BackButton';

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch('/notifications');
      setItems(data.items);
      setUnread(data.unread);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function markRead(id: string, link?: string) {
    try {
      await apiFetch(`/notifications/${id}/read`, { method: 'POST' });
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      setUnread((u) => Math.max(0, u - 1));
    } catch (e: any) {
      console.error(e);
    }
    if (link) router.push(link);
  }

  async function markAllRead() {
    try {
      await apiFetch('/notifications/read-all', { method: 'POST' });
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnread(0);
    } catch (e: any) {
      console.error(e);
    }
  }

  return (
    <div className="page-container" style={{ maxWidth: 700 }}>
      <BackButton label="Trở về" />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h1 className="page-title">Thông báo</h1>
        {unread > 0 && (
          <button
            className="btn btn-outline"
            style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }}
            onClick={markAllRead}
          >
            Đánh dấu tất cả đã đọc ({unread})
          </button>
        )}
      </div>

      {loading ? (
        <p>Đang tải…</p>
      ) : items.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 44, color: 'var(--color-muted)' }}>
          <p style={{ fontSize: 16 }}>🔕 Chưa có thông báo nào</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((n) => (
            <div
              key={n.id}
              className="card"
              style={{
                padding: 14,
                cursor: n.link ? 'pointer' : 'default',
                borderLeft: n.isRead ? undefined : '4px solid var(--color-accent)',
              }}
              onClick={() => !n.isRead && markRead(n.id, n.link)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <strong style={{ fontSize: 14 }}>{n.title}</strong>
                <span className="mono" style={{ fontSize: 11, color: 'var(--color-muted)', flexShrink: 0 }}>
                  {n.createdAt ? new Date(n.createdAt).toLocaleString('vi-VN') : ''}
                </span>
              </div>
              {n.body && (
                <p style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 4 }}>{n.body}</p>
              )}
              {!n.isRead && (
                <span className="badge badge-accent" style={{ marginTop: 6, fontSize: 11 }}>
                  Mới
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
