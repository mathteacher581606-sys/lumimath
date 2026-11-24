'use client';

import { useEffect, useRef, useState } from 'react';

// Camera chụp ngay trong trang (getUserMedia): học sinh chụp liên tiếp nhiều trang bài làm
// mà KHÔNG phải rời khỏi trang thi (không bị tính cảnh báo, trang không bị điện thoại tải lại).
// Cần HTTPS + được cấp quyền camera; nếu không được, ImageUploader dùng lại cách chụp cũ.
export function cameraSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  );
}

export default function CameraCapture({
  onShot,
  onClose,
  onUnavailable,
}: {
  onShot: (file: File) => void;
  onClose: () => void;
  onUnavailable: (reason: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [count, setCount] = useState(0);
  const [ready, setReady] = useState(false);
  const [flash, setFlash] = useState(false);
  const [thumb, setThumb] = useState('');

  function stop() {
    const s = streamRef.current;
    if (s) s.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    stop();
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 2560 }, height: { ideal: 1440 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => {});
          setReady(true);
        }
      } catch (e: any) {
        if (cancelled) return;
        const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
        onUnavailable(
          denied
            ? 'Chưa được cấp quyền camera cho trang này — em dùng nút “Chụp bằng camera máy”.'
            : 'Không mở được camera trong trang — em dùng nút “Chụp bằng camera máy”.',
        );
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  // Đóng camera khi component biến mất (nộp bài, chuyển câu…)
  useEffect(() => () => stop(), []);

  function shoot() {
    const v = videoRef.current;
    if (!v || !ready || !v.videoWidth) return;
    const maxDim = 2200;
    const scale = Math.min(1, maxDim / Math.max(v.videoWidth, v.videoHeight));
    const w = Math.round(v.videoWidth * scale);
    const h = Math.round(v.videoHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, w, h);
    setFlash(true);
    setTimeout(() => setFlash(false), 120);
    canvas.toBlob(
      (blob) => {
        canvas.width = 0;
        canvas.height = 0;
        if (!blob) return;
        const file = new File([blob], `chup-${Date.now()}.jpg`, { type: 'image/jpeg' });
        setThumb((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(file);
        });
        setCount((c) => c + 1);
        onShot(file);
      },
      'image/jpeg',
      0.88,
    );
  }

  useEffect(() => () => {
    setThumb((old) => {
      if (old) URL.revokeObjectURL(old);
      return '';
    });
  }, []);

  return (
    <div className="cam-root" role="dialog" aria-modal="true" aria-label="Chụp ảnh bài làm">
      <video ref={videoRef} className="cam-video" playsInline muted autoPlay />
      {flash && <div className="cam-flash" />}
      {!ready && <div className="cam-wait">Đang mở camera…</div>}
      <div className="cam-hint">Đặt trang giấy vừa khung, đủ sáng, rồi bấm nút tròn. Chụp được nhiều trang liên tiếp.</div>
      <div className="cam-bar">
        <button type="button" className="cam-side" onClick={() => setFacing(facing === 'environment' ? 'user' : 'environment')} aria-label="Đổi camera trước/sau">
          ⟲
        </button>
        <button type="button" className="cam-shutter" onClick={shoot} disabled={!ready} aria-label="Chụp" />
        <button type="button" className="cam-done" onClick={onClose}>
          {thumb && <img src={thumb} alt="" />}
          <span>{count > 0 ? `Xong (${count})` : 'Đóng'}</span>
        </button>
      </div>
    </div>
  );
}
