'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';

// Mục lục ngân hàng câu hỏi (theo mẫu đã duyệt): chọn lớp dạng nút gạt, cây gọn,
// bấm tên để lọc, nút ⋯ từng mục để thêm/đổi tên/chuyển/xoá, và "Sắp xếp lại" để dọn mục lẻ & mục trùng.

type TNode = { id: string; name: string; grade: number | null; parentId: string | null; count: number; own?: number; children: TNode[] };

// "CHƯƠNG I. MỆNH ĐỀ VÀ TẬP HỢP" → "Chương I. Mệnh đề và tập hợp" (chỉ đổi cách hiển thị)
export function prettyTopic(name: string): string {
  const s = String(name || '').trim();
  const letters = s.replace(/[^A-Za-zÀ-ỹ]/g, '');
  const upper = letters.replace(/[^A-ZÀÁẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬĐÈÉẺẼẸÊẾỀỂỄỆÌÍỈĨỊÒÓỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÙÚỦŨỤƯỨỪỬỮỰỲÝỶỸỴ]/g, '');
  if (letters.length < 4 || upper.length / letters.length < 0.7) return s;
  let out = s.toLocaleLowerCase('vi');
  // Viết hoa chữ đầu câu và sau dấu chấm / hai chấm
  out = out.replace(/(^|[.:!?]\s+)(\p{L})/gu, (_m, p, c) => p + c.toLocaleUpperCase('vi'));
  // Giữ số La Mã sau "Chương/Phần" và các ký hiệu Oxyz
  out = out.replace(/(chương|phần)\s+([ivxlc]+)\b/giu, (_m, w, r) => `${w[0].toUpperCase()}${w.slice(1)} ${r.toUpperCase()}`);
  out = out.replace(/\boxyz\b/g, 'Oxyz').replace(/\boxy\b/g, 'Oxy');
  return out;
}

function flatten(nodes: TNode[], depth = 0, out: { n: TNode; depth: number }[] = []) {
  for (const n of nodes) {
    out.push({ n, depth });
    flatten(n.children || [], depth + 1, out);
  }
  return out;
}

function subtreeIds(n: TNode, set = new Set<string>()) {
  set.add(n.id);
  (n.children || []).forEach((c) => subtreeIds(c, set));
  return set;
}

export default function BankTopicSidebar(props: {
  tree: TNode[];
  summary: any;
  fGrade: string;
  fTopic: string;
  onSelectAll: () => void;
  onSelectGrade: (g: string) => void;
  onSelectTopic: (n: TNode) => void;
  onReload: () => Promise<void> | void;
  forms: any[];
  fForm: string;
  onPickForm: (v: string) => void;
  onOpenForms: () => void;
  sources: any[];
  fSource: string;
  onPickSource: (v: string) => void;
  onAddSource: () => void;
  onRemoveSource: (name: string) => void;
  seeding: boolean;
  onSeed: () => void;
  reclassifying: boolean;
  onReclassify: () => void;
}) {
  const { tree, summary, fGrade, fTopic } = props;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [moving, setMoving] = useState<TNode | null>(null);
  const [tidyOpen, setTidyOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Lớp đang xem: '' = tất cả
  const grades = useMemo(() => {
    const list = ['10', '11', '12'].filter(
      (g) => tree.some((t) => String(t.grade) === g) || (summary?.byGrade?.[g] ?? 0) > 0,
    );
    if (tree.some((t) => t.grade == null) || (summary?.byGrade?.none ?? 0) > 0) list.push('none');
    return list;
  }, [tree, summary]);

  // Tự mở nhánh chứa mục đang chọn
  useEffect(() => {
    if (!fTopic) return;
    const path: string[] = [];
    const walk = (ns: TNode[], trail: string[]): boolean => {
      for (const n of ns) {
        if (n.id === fTopic) {
          path.push(...trail);
          return true;
        }
        if (walk(n.children || [], [...trail, n.id])) return true;
      }
      return false;
    };
    walk(tree, []);
    if (path.length) setOpen((o) => new Set([...Array.from(o), ...path]));
  }, [fTopic, tree]);

  useEffect(() => {
    if (!menuFor && !toolsOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as globalThis.Node)) {
        setMenuFor(null);
        setToolsOpen(false);
      }
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuFor(null);
        setToolsOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [menuFor, toolsOpen]);

  const q = query.trim().toLowerCase();
  const matches = (n: TNode): boolean =>
    !q || prettyTopic(n.name).toLowerCase().includes(q) || (n.children || []).some(matches);

  const roots = tree.filter((t) => {
    const g = t.grade == null ? 'none' : String(t.grade);
    return (!fGrade || g === fGrade) && matches(t);
  });

  function toggle(id: string) {
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function addChild(parent: TNode | null, grade: string) {
    const name = window.prompt(parent ? `Tên mục con trong “${prettyTopic(parent.name)}”:` : `Tên chương mới (Lớp ${grade}):`);
    if (!name || !name.trim()) return;
    try {
      await apiFetch('/bank/topics', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          grade: parent ? parent.grade : Number(grade) || null,
          ...(parent ? { parentId: parent.id } : {}),
        }),
      });
      if (parent) setOpen((o) => new Set([...Array.from(o), parent.id]));
      await props.onReload();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function rename(n: TNode) {
    const name = window.prompt('Tên mới:', n.name);
    if (!name || !name.trim() || name.trim() === n.name) return;
    try {
      await apiFetch(`/bank/topics/${n.id}`, { method: 'PATCH', body: JSON.stringify({ name: name.trim() }) });
      await props.onReload();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function remove(n: TNode) {
    const sub = (n.children || []).length;
    if (
      !window.confirm(
        `Xoá mục “${prettyTopic(n.name)}”?\n\n${n.count} câu hỏi bên trong được GIỮ NGUYÊN và chuyển về “chưa phân loại”.` +
          (sub ? `\n${sub} mục con sẽ được đưa lên gốc lớp.` : ''),
      )
    )
      return;
    try {
      await apiFetch(`/bank/topics/${n.id}`, { method: 'DELETE' });
      await props.onReload();
    } catch (e: any) {
      alert(e.message);
    }
  }

  function renderNode(n: TNode, depth: number): any {
    if (!matches(n)) return null;
    const kids = n.children || [];
    const isOpen = open.has(n.id) || !!q;
    const active = fTopic === n.id;
    return (
      <li key={n.id}>
        <div className={`bt-row${active ? ' is-on' : ''}`} style={{ paddingLeft: 4 + depth * 14 }}>
          <button
            type="button"
            className="bt-caret"
            aria-label={kids.length ? (isOpen ? 'Thu gọn' : 'Mở rộng') : undefined}
            aria-expanded={kids.length ? isOpen : undefined}
            tabIndex={kids.length ? 0 : -1}
            onClick={() => kids.length && toggle(n.id)}
          >
            {kids.length ? (isOpen ? '⌄' : '›') : ''}
          </button>
          <button
            type="button"
            className={`bt-name${depth === 0 ? ' is-root' : ''}`}
            aria-current={active ? 'true' : undefined}
            title={n.name}
            onClick={() => {
              props.onSelectTopic(n);
              if (kids.length && !open.has(n.id)) toggle(n.id);
            }}
          >
            {prettyTopic(n.name)}
          </button>
          <span className="bt-count">{n.count}</span>
          <div className="bt-more" ref={menuFor === n.id ? menuRef : undefined}>
            <button
              type="button"
              className="bt-more-btn"
              aria-label={`Thao tác với ${prettyTopic(n.name)}`}
              aria-expanded={menuFor === n.id}
              onClick={() => setMenuFor(menuFor === n.id ? null : n.id)}
            >
              ⋯
            </button>
            {menuFor === n.id && (
              <div className="tl-menu-list bt-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => { setMenuFor(null); addChild(n, String(n.grade ?? '')); }}>
                  Thêm mục con
                </button>
                <button type="button" role="menuitem" onClick={() => { setMenuFor(null); rename(n); }}>
                  Đổi tên
                </button>
                <button type="button" role="menuitem" onClick={() => { setMenuFor(null); setMoving(n); }}>
                  Chuyển / gộp vào mục khác…
                </button>
                <hr />
                <button type="button" role="menuitem" className="is-danger" onClick={() => { setMenuFor(null); remove(n); }}>
                  Xoá mục…
                </button>
              </div>
            )}
          </div>
        </div>
        {kids.length > 0 && isOpen && <ul className="bt-list">{kids.map((c) => renderNode(c, depth + 1))}</ul>}
      </li>
    );
  }

  const gradeLabel = (g: string) => (g === 'none' ? 'Khác' : `Lớp ${g}`);
  const grouped = !fGrade
    ? grades.map((g) => ({ g, nodes: roots.filter((t) => (t.grade == null ? 'none' : String(t.grade)) === g) }))
    : [{ g: fGrade, nodes: roots }];

  return (
    <aside className="bt-side" aria-label="Mục lục ngân hàng câu hỏi">
      <div className="bt-head" ref={toolsOpen ? menuRef : undefined}>
        <h2>Mục lục</h2>
        <button type="button" className="bt-tool" onClick={() => setTidyOpen(true)} title="Gộp mục trùng, đưa mục lẻ vào đúng chương">
          Sắp xếp lại
        </button>
        <div className="bt-more">
          <button type="button" className="bt-more-btn" aria-label="Công cụ mục lục" aria-expanded={toolsOpen} onClick={() => setToolsOpen(!toolsOpen)}>
            ⋯
          </button>
          {toolsOpen && (
            <div className="tl-menu-list bt-menu" role="menu">
              <button type="button" role="menuitem" disabled={props.seeding} onClick={() => { setToolsOpen(false); props.onSeed(); }}>
                {props.seeding ? 'Đang cập nhật…' : 'Bổ sung mục lục chuẩn 10–12'}
              </button>
              <button type="button" role="menuitem" disabled={props.reclassifying} onClick={() => { setToolsOpen(false); props.onReclassify(); }}>
                {props.reclassifying ? 'AI đang phân loại…' : 'AI xếp câu hỏi vào đúng dạng'}
              </button>
              {fGrade && fGrade !== 'none' && (
                <button type="button" role="menuitem" onClick={() => { setToolsOpen(false); addChild(null, fGrade); }}>
                  Thêm chương mới cho Lớp {fGrade}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="bt-seg" role="tablist" aria-label="Khối lớp">
        <button type="button" role="tab" aria-selected={!fGrade} className={!fGrade ? 'on' : ''} onClick={props.onSelectAll}>
          Tất cả
        </button>
        {grades.filter((g) => g !== 'none').map((g) => (
          <button
            key={g}
            type="button"
            role="tab"
            aria-selected={fGrade === g}
            className={fGrade === g ? 'on' : ''}
            onClick={() => props.onSelectGrade(g)}
          >
            Lớp {g}
          </button>
        ))}
      </div>

      <input className="bt-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm chương, bài, dạng…" aria-label="Tìm trong mục lục" />

      <button
        type="button"
        className={`bt-row bt-all${!fTopic ? ' is-on' : ''}`}
        onClick={() => (fGrade ? props.onSelectGrade(fGrade) : props.onSelectAll())}
      >
        <span className="bt-name">{fGrade ? `Toàn bộ ${gradeLabel(fGrade)}` : 'Toàn bộ ngân hàng'}</span>
        <span className="bt-count">{fGrade ? summary?.byGrade?.[fGrade] ?? 0 : summary?.total ?? 0}</span>
      </button>

      <div className="bt-tree">
        {grouped.map(({ g, nodes }) =>
          nodes.length ? (
            <section key={g}>
              {!fGrade && <div className="bt-grade">{gradeLabel(g)}</div>}
              <ul className="bt-list">{nodes.map((n) => renderNode(n, 0))}</ul>
            </section>
          ) : null,
        )}
        {!roots.length && <p className="bt-empty">{q ? 'Không có mục nào khớp.' : 'Chưa có mục lục cho lớp này.'}</p>}
      </div>

      <div className="bt-filters">
        <label className="bt-flt">
          <span>Dạng bài</span>
          <span className="bt-flt-row">
            <select value={props.fForm} onChange={(e) => props.onPickForm(e.target.value)}>
              <option value="">Tất cả dạng</option>
              {props.forms.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name} ({f.count})
                </option>
              ))}
            </select>
            <button type="button" className="bt-mini" onClick={props.onOpenForms} title="Kho dạng bài">
              Quản lý
            </button>
          </span>
        </label>
        <label className="bt-flt">
          <span>Nguồn đề</span>
          <span className="bt-flt-row">
            <select value={props.fSource} onChange={(e) => props.onPickSource(e.target.value)}>
              <option value="">Tất cả nguồn</option>
              {props.sources.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name} ({s.count})
                </option>
              ))}
            </select>
            <button type="button" className="bt-mini" onClick={props.onAddSource} title="Thêm nguồn đề">
              + Thêm
            </button>
          </span>
        </label>
        {props.fSource && (
          <button type="button" className="bt-link-danger" onClick={() => props.onRemoveSource(props.fSource)}>
            Xoá nguồn “{props.fSource}” khỏi danh sách
          </button>
        )}
      </div>

      {moving && (
        <MoveDialog
          node={moving}
          tree={tree}
          onClose={() => setMoving(null)}
          onDone={async () => {
            setMoving(null);
            await props.onReload();
          }}
        />
      )}
      {tidyOpen && (
        <TidyDialog
          tree={tree}
          onClose={() => setTidyOpen(false)}
          onDone={async () => {
            setTidyOpen(false);
            await props.onReload();
          }}
        />
      )}
    </aside>
  );
}

// ================== CHUYỂN / GỘP MỘT MỤC ==================
function MoveDialog({ node, tree, onClose, onDone }: { node: TNode; tree: TNode[]; onClose: () => void; onDone: () => void }) {
  const [target, setTarget] = useState('');
  const [mode, setMode] = useState<'move' | 'merge'>('move');
  const [busy, setBusy] = useState(false);
  const banned = useMemo(() => subtreeIds(node), [node]);
  const options = flatten(tree).filter(({ n }) => !banned.has(n.id));

  async function apply() {
    setBusy(true);
    try {
      if (mode === 'move' && target === '__root__') {
        await apiFetch(`/bank/topics/${node.id}`, { method: 'PATCH', body: JSON.stringify({ parentId: null }) });
      } else {
        await apiFetch('/bank/topics/tidy', {
          method: 'POST',
          body: JSON.stringify({ actions: [{ kind: mode, fromId: node.id, intoId: target }] }),
        });
      }
      onDone();
    } catch (e: any) {
      alert(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="bt-modal-back" onClick={onClose}>
      <div className="bt-modal" role="dialog" aria-modal="true" aria-label="Chuyển hoặc gộp mục" onClick={(e) => e.stopPropagation()}>
        <h3>“{prettyTopic(node.name)}”</h3>
        <div className="bt-seg" role="radiogroup">
          <button type="button" className={mode === 'move' ? 'on' : ''} onClick={() => setMode('move')}>
            Chuyển vào trong
          </button>
          <button type="button" className={mode === 'merge' ? 'on' : ''} onClick={() => { setMode('merge'); if (target === '__root__') setTarget(''); }}>
            Gộp vào (xoá mục này)
          </button>
        </div>
        <p className="bt-note">
          {mode === 'move'
            ? 'Mục này (cùng mục con và câu hỏi) trở thành mục con của mục bạn chọn.'
            : `${node.count} câu hỏi và các mục con chuyển sang mục bạn chọn, rồi mục này bị xoá.`}
        </p>
        <select value={target} onChange={(e) => setTarget(e.target.value)} size={12} className="bt-pick">
          {mode === 'move' && <option value="__root__">— Đưa ra gốc (thành chương) —</option>}
          {options.map(({ n, depth }) => (
            <option key={n.id} value={n.id}>
              {'   '.repeat(depth)}
              {n.grade ? `[${n.grade}] ` : ''}
              {prettyTopic(n.name)}
            </option>
          ))}
        </select>
        <div className="bt-modal-act">
          <button type="button" className="btn btn-outline cl-btn" onClick={onClose}>
            Huỷ
          </button>
          <button type="button" className="btn sh-btn-accent cl-btn" disabled={!target || busy} onClick={apply}>
            {busy ? 'Đang lưu…' : mode === 'move' ? 'Chuyển' : 'Gộp'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ================== SẮP XẾP LẠI CẢ MỤC LỤC ==================
function TidyDialog({ tree, onClose, onDone }: { tree: TNode[]; onClose: () => void; onDone: () => void }) {
  const [plan, setPlan] = useState<any[] | null>(null);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [targets, setTargets] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const chapters = useMemo(() => flatten(tree).filter(({ depth }) => depth <= 1), [tree]);

  useEffect(() => {
    apiFetch('/bank/topics/tidy')
      .then((d) => {
        const list = d?.actions || [];
        setPlan(list);
        const c: Record<number, boolean> = {};
        list.forEach((a: any, i: number) => (c[i] = a.kind !== 'manual'));
        setChecked(c);
      })
      .catch((e) => setErr(e.message));
  }, []);

  async function apply() {
    if (!plan) return;
    const actions = plan
      .map((a, i) => {
        if (!checked[i]) return null;
        const intoId = a.kind === 'manual' ? targets[i] : a.into?.id;
        if (!intoId) return null;
        return { kind: a.kind === 'merge' ? 'merge' : 'move', fromId: a.from.id, intoId };
      })
      .filter(Boolean);
    if (!actions.length) return onClose();
    setBusy(true);
    try {
      const r = await apiFetch('/bank/topics/tidy', { method: 'POST', body: JSON.stringify({ actions }) });
      alert(`Đã gộp ${r.merged} mục, chuyển ${r.moved} mục (${r.questions} câu hỏi đổi thư mục).`);
      onDone();
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  }

  const n = plan ? plan.filter((_, i) => checked[i]).length : 0;

  return (
    <div className="bt-modal-back" onClick={onClose}>
      <div className="bt-modal is-wide" role="dialog" aria-modal="true" aria-label="Sắp xếp lại mục lục" onClick={(e) => e.stopPropagation()}>
        <h3>Sắp xếp lại mục lục</h3>
        <p className="bt-note">
          Hệ thống tìm mục <b>trùng tên</b> và mục <b>lẻ nằm ngoài chương</b>. Bỏ tick những gợi ý bạn không muốn. Câu hỏi
          không bị xoá — chỉ đổi thư mục.
        </p>
        {err && <p className="bt-err">{err}</p>}
        {!plan ? (
          <p className="bt-note">Đang rà mục lục…</p>
        ) : !plan.length ? (
          <p className="bt-note">Mục lục đã gọn gàng — không có mục trùng hay mục lẻ.</p>
        ) : (
          <ul className="bt-plan">
            {plan.map((a, i) => (
              <li key={i} className={checked[i] ? 'is-on' : ''}>
                <label className="bt-plan-row">
                  <input type="checkbox" checked={!!checked[i]} onChange={(e) => setChecked({ ...checked, [i]: e.target.checked })} />
                  <span className="bt-plan-body">
                    <span className={`bt-badge is-${a.kind}`}>{a.kind === 'merge' ? 'Gộp' : a.kind === 'move' ? 'Chuyển vào' : 'Chọn chương'}</span>{' '}
                    <b>{prettyTopic(a.from.path || a.from.name)}</b>
                    <span className="bt-muted"> · {a.from.questions} câu{a.from.grade ? ` · Lớp ${a.from.grade}` : ''}</span>
                    {a.into && (
                      <span className="bt-plan-into">
                        → {prettyTopic(a.into.path || a.into.name)}
                        {a.gradeChange && (
                          <span className="bt-warn">
                            {' '}
                            (câu hỏi đổi từ Lớp {a.gradeChange.from ?? '?'} sang Lớp {a.gradeChange.to})
                          </span>
                        )}
                      </span>
                    )}
                    {a.kind === 'manual' && (
                      <select
                        value={targets[i] || ''}
                        onChange={(e) => {
                          setTargets({ ...targets, [i]: e.target.value });
                          setChecked({ ...checked, [i]: !!e.target.value });
                        }}
                        onClick={(e) => e.preventDefault()}
                      >
                        <option value="">— Chọn chương / bài để đưa vào —</option>
                        {chapters
                          .filter(({ n: c }) => c.id !== a.from.id)
                          .map(({ n: c, depth }) => (
                            <option key={c.id} value={c.id}>
                              {depth ? '   ' : ''}
                              {c.grade ? `[${c.grade}] ` : ''}
                              {prettyTopic(c.name)}
                            </option>
                          ))}
                      </select>
                    )}
                    <span className="bt-muted bt-reason">{a.reason}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="bt-modal-act">
          <button type="button" className="btn btn-outline cl-btn" onClick={onClose}>
            Đóng
          </button>
          {!!plan?.length && (
            <button type="button" className="btn sh-btn-accent cl-btn" disabled={busy || !n} onClick={apply}>
              {busy ? 'Đang sắp xếp…' : `Áp dụng ${n} thay đổi`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
