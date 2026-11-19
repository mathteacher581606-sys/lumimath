'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from './api';

// Lấy thông tin tài khoản hiện tại (kèm cờ assistantOnly = trợ giảng thuần)
export function useMe() {
  const [me, setMe] = useState<any>(null);
  useEffect(() => {
    let alive = true;
    apiFetch('/auth/me')
      .then((d: any) => {
        if (alive) setMe(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return me;
}
