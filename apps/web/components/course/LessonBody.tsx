'use client';

import LatexRenderer from '@/components/LatexRenderer';

// Phần nội dung chung của một bài giảng (video · nội dung · tài liệu) — dùng cho HS và GV

export function getYoutubeEmbed(url: string): string | null {
  if (!url) return null;
  const patterns = [
    /youtu\.be\/([^/?&]+)/,
    /youtube\.com\/watch\?.*v=([^&]+)/,
    /youtube\.com\/embed\/([^/?&]+)/,
    /youtube\.com\/shorts\/([^/?&]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) {
      // youtube-nocookie: không cookie theo dõi; ẩn logo, video liên quan, chú thích; phát tại chỗ trên mobile
      return `https://www.youtube-nocookie.com/embed/${m[1]}?modestbranding=1&rel=0&iv_load_policy=3&disablekb=1&playsinline=1`;
    }
  }
  return null;
}

export function lessonVideos(lesson: any): { title?: string; url: string }[] {
  if (Array.isArray(lesson?.videos) && lesson.videos.some((v: any) => v?.url)) {
    return lesson.videos.filter((v: any) => v?.url);
  }
  return lesson?.youtubeUrl ? [{ title: '', url: lesson.youtubeUrl }] : [];
}

export function lessonMaterials(lesson: any): { title: string; url: string }[] {
  const mats = Array.isArray(lesson?.materials) ? lesson.materials.filter((m: any) => m?.url) : [];
  const legacy = (lesson?.pdfLinks || []).map((u: string, j: number) => ({
    title: `Tài liệu ${j + 1}`,
    url: u,
  }));
  return [
    ...mats.map((m: any, j: number) => ({ title: m.title || `Tài liệu ${j + 1}`, url: m.url })),
    ...legacy.filter((x: any) => !mats.some((m: any) => m.url === x.url)),
  ];
}

function fileKind(url: string) {
  const u = url.toLowerCase().split('?')[0];
  if (u.endsWith('.pdf')) return 'PDF';
  if (u.endsWith('.doc') || u.endsWith('.docx')) return 'Word';
  if (u.endsWith('.ppt') || u.endsWith('.pptx')) return 'Slide';
  if (u.includes('drive.google')) return 'Drive';
  return 'Liên kết';
}

export default function LessonBody({ lesson }: { lesson: any }) {
  const vids = lessonVideos(lesson);
  const mats = lessonMaterials(lesson);
  const empty = !vids.length && !lesson?.content && !mats.length;
  return (
    <div className="cl-body">
      {vids.map((v, vi) => {
        const emb = getYoutubeEmbed(v.url);
        return (
          <figure key={vi} className="cl-video">
            {emb ? (
              <div className="cl-video-frame">
                <iframe
                  src={emb}
                  title={v.title || lesson.title}
                  allowFullScreen
                  allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                  sandbox="allow-scripts allow-same-origin allow-presentation allow-autoplay"
                />
                {/* Che thanh tiêu đề YouTube để HS không bấm ra ngoài */}
                <div aria-hidden className="cl-video-guard" onContextMenu={(e) => e.preventDefault()} />
              </div>
            ) : (
              <video controls src={v.url} className="cl-video-file" />
            )}
            {v.title && <figcaption>{v.title}</figcaption>}
          </figure>
        );
      })}

      {lesson?.content && (
        <div className="cl-prose">
          <LatexRenderer content={lesson.content} />
        </div>
      )}

      {mats.length > 0 && (
        <div className="cl-mats">
          <h3 className="cl-h3">Tài liệu</h3>
          <ul>
            {mats.map((m, j) => (
              <li key={j}>
                <a href={m.url} target="_blank" rel="noreferrer" className="cl-mat">
                  <span className="cl-mat-kind">{fileKind(m.url)}</span>
                  <span className="cl-mat-title">{m.title}</span>
                  <span aria-hidden>↗</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {empty && <p className="cl-muted">Bài này chưa có video, nội dung hay tài liệu.</p>}
    </div>
  );
}
