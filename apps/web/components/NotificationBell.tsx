'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useRouter } from 'next/navigation';

// Chuông thông báo + số chưa đọc (hiển thị trên sidebar GV + HS)
export default function NotificationBell() {
  const router = useRouter();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const data = await apiFetch('/notifications');
        if (mounted) setUnread(data.unread);
      } catch (e) {
        /* im lặng */
      }
    }
    load();
    const timer = setInterval(load, 60000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <button
      onClick={() => router.push('/notifications')}
      title="Thông báo"
      style={{
        position: 'relative',
        background: 'transparent',
        border: 'none',
        fontSize: 20,
        cursor: 'pointer',
        padding: 4,
        lineHeight: 1,
      }}
    >
      🔔
      {unread > 0 && (
        <span
          className="mono"
          style={{
            position: 'absolute',
            top: -6,
            right: -8,
            background: 'var(--color-danger)',
            color: '#fff',
            fontSize: 10,
            fontWeight: 700,
            borderRadius: 999,
            padding: '2px 6px',
            minWidth: 18,
            textAlign: 'center',
          }}
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  );
}
