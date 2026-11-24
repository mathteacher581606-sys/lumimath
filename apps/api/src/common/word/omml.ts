/**
 * LaTeX → OMML (Office Math — phương trình gốc của Word, bấm vào sửa được;
 * MathType: Convert Equations để đổi sang đối tượng MathType).
 *
 * Tự viết, không thư viện ngoài. Bao phủ toán phổ thông: phân số, căn, mũ/chỉ số, tổng/tích
 * phân/giới hạn, hàm số, vectơ/mũ/gạch trên, cung, ngoặc \left…\right, ma trận, hệ/hoặc
 * (cases, \heva, \hoac), aligned, chữ trong công thức, chữ Hy Lạp, ký hiệu tập hợp/logic…
 * Lệnh lạ không làm hỏng công thức: giữ đối số (hoặc tên lệnh) và được đếm vào `unknown`.
 */

export type OmmlResult = { xml: string; unknown: string[] };

// ===================== Bảng ký hiệu =====================

const SYM: Record<string, string> = {
  // Hy Lạp
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ',
  eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν',
  xi: 'ξ', pi: 'π', varpi: 'ϖ', rho: 'ρ', varrho: 'ϱ', sigma: 'σ', varsigma: 'ς', tau: 'τ',
  upsilon: 'υ', phi: 'ϕ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ',
  Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  // phép toán
  pm: '±', mp: '∓', times: '×', div: '÷', cdot: '⋅', cdotp: '⋅', ast: '∗', star: '⋆',
  circ: '∘', bullet: '∙', oplus: '⊕', otimes: '⊗', setminus: '∖', backslash: '\\',
  cup: '∪', cap: '∩', wedge: '∧', land: '∧', vee: '∨', lor: '∨', neg: '¬', lnot: '¬',
  // quan hệ
  le: '≤', leq: '≤', ge: '≥', geq: '≥', leqslant: '⩽', geqslant: '⩾', ne: '≠', neq: '≠',
  lt: '<', gt: '>', approx: '≈', equiv: '≡', sim: '∼', simeq: '≃', cong: '≅', propto: '∝',
  ll: '≪', gg: '≫', in: '∈', notin: '∉', ni: '∋', subset: '⊂', supset: '⊃',
  subseteq: '⊆', supseteq: '⊇', subsetneq: '⊊', supsetneq: '⊋', nsubseteq: '⊈',
  perp: '⊥', parallel: '∥', nparallel: '∦', mid: '∣', nmid: '∤', models: '⊨', vdash: '⊢',
  // mũi tên
  to: '→', rightarrow: '→', leftarrow: '←', gets: '←', leftrightarrow: '↔',
  Rightarrow: '⇒', Leftarrow: '⇐', Leftrightarrow: '⇔', implies: '⇒', impliedby: '⇐',
  iff: '⇔', longrightarrow: '⟶', longleftarrow: '⟵', longleftrightarrow: '⟷',
  Longrightarrow: '⟹', Longleftarrow: '⟸', Longleftrightarrow: '⟺', mapsto: '↦',
  uparrow: '↑', downarrow: '↓', nearrow: '↗', searrow: '↘', nwarrow: '↖', swarrow: '↙',
  rightleftharpoons: '⇌', hookrightarrow: '↪',
  // khác
  infty: '∞', partial: '∂', nabla: '∇', forall: '∀', exists: '∃', nexists: '∄',
  emptyset: '∅', varnothing: '∅', angle: '∠', measuredangle: '∡', triangle: '△',
  square: '□', Box: '□', blacksquare: '■', diamond: '⋄', prime: '′', degree: '°',
  ldots: '…', cdots: '⋯', dots: '…', vdots: '⋮', ddots: '⋱', hbar: 'ℏ', ell: 'ℓ',
  aleph: 'ℵ', Re: 'ℜ', Im: 'ℑ', wp: '℘', because: '∵', therefore: '∴', top: '⊤', bot: '⊥',
  lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉', langle: '⟨', rangle: '⟩',
  vert: '|', lvert: '|', rvert: '|', Vert: '‖', lVert: '‖', rVert: '‖',
  lbrace: '{', rbrace: '}', colon: ':', checkmark: '✓', dagger: '†', S: '§', P: '¶',
  surd: '√', complement: '∁', imath: 'ı', jmath: 'ȷ',
};

// Lệnh tạo khoảng trắng
const SPACES: Record<string, string> = {
  ',': ' ', ';': ' ', ':': ' ', '>': ' ', ' ': ' ', quad: ' ',
  qquad: '  ', enspace: ' ', thinspace: ' ', '!': '', negthinspace: '',
};

// Hàm số (chữ đứng)
const FUNCS = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'arccot', 'sinh',
  'cosh', 'tanh', 'coth', 'log', 'ln', 'lg', 'exp', 'det', 'dim', 'ker', 'hom', 'arg',
  'deg', 'gcd', 'lcm', 'Pr', 'tg', 'cotg', 'sh', 'ch', 'th',
]);
// Toán tử có giới hạn dưới/trên (đặt dưới/trên như \lim)
const LIMOPS = new Set(['lim', 'max', 'min', 'sup', 'inf', 'limsup', 'liminf', 'argmax', 'argmin']);

// N-ary: tổng, tích, tích phân…
const NARY: Record<string, { chr: string; under: boolean }> = {
  sum: { chr: '∑', under: true }, prod: { chr: '∏', under: true }, coprod: { chr: '∐', under: true },
  bigcup: { chr: '⋃', under: true }, bigcap: { chr: '⋂', under: true },
  bigvee: { chr: '⋁', under: true }, bigwedge: { chr: '⋀', under: true },
  bigoplus: { chr: '⨁', under: true }, bigotimes: { chr: '⨂', under: true },
  int: { chr: '∫', under: false }, iint: { chr: '∬', under: false }, iiint: { chr: '∭', under: false },
  oint: { chr: '∮', under: false }, dint: { chr: '∫', under: false }, tint: { chr: '∫', under: false },
};

// Dấu trên đầu (acc) — ký tự tổ hợp
const ACCENTS: Record<string, string> = {
  vec: '⃗', vv: '⃗', overrightarrow: '⃗', vecto: '⃗', overleftarrow: '⃖',
  overleftrightarrow: '⃡', hat: '̂', widehat: '̂', tilde: '̃',
  widetilde: '̃', bar: '̅', dot: '̇', ddot: '̈', check: '̌',
  breve: '̆', acute: '́', grave: '̀', mathring: '̊',
};

// Kiểu chữ toán (bộ chữ Unicode)
function mapAlpha(text: string, kind: string): string {
  const special: Record<string, Record<string, string>> = {
    bb: { C: 'ℂ', H: 'ℍ', N: 'ℕ', P: 'ℙ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ' },
    cal: { B: 'ℬ', E: 'ℰ', F: 'ℱ', H: 'ℋ', I: 'ℐ', L: 'ℒ', M: 'ℳ', R: 'ℛ', e: 'ℯ', g: 'ℊ', o: 'ℴ' },
    frak: { C: 'ℭ', H: 'ℌ', I: 'ℑ', R: 'ℜ', Z: 'ℨ' },
  };
  const base: Record<string, [number, number]> = {
    bb: [0x1d538, 0x1d552],
    cal: [0x1d49c, 0x1d4b6],
    frak: [0x1d504, 0x1d51e],
  };
  if (!base[kind]) return text;
  let out = '';
  for (const ch of text) {
    if (special[kind][ch]) out += special[kind][ch];
    else if (/[A-Z]/.test(ch)) out += String.fromCodePoint(base[kind][0] + ch.charCodeAt(0) - 65);
    else if (/[a-z]/.test(ch)) out += String.fromCodePoint(base[kind][1] + ch.charCodeAt(0) - 97);
    else if (kind === 'bb' && /[0-9]/.test(ch)) out += String.fromCodePoint(0x1d7d8 + ch.charCodeAt(0) - 48);
    else out += ch;
  }
  return out;
}

// ===================== Tách token =====================

type Tok =
  | { k: 'cmd'; v: string } // \name hoặc \ký-tự
  | { k: 'ch'; v: string }
  | { k: '{' }
  | { k: '}' }
  | { k: '^' }
  | { k: '_' }
  | { k: '&' }
  | { k: 'nl' } // \\
  | { k: 'sp' };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  const s = String(src || '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') {
      const n = s[i + 1];
      if (n === undefined) break;
      if (n === '\\') {
        out.push({ k: 'nl' });
        i++;
        // bỏ [2pt] sau \\
        const m = /^\s*\[[^\]]*\]/.exec(s.slice(i + 1));
        if (m) i += m[0].length;
        continue;
      }
      if (/[a-zA-Z@]/.test(n)) {
        let j = i + 1;
        while (j < s.length && /[a-zA-Z@]/.test(s[j])) j++;
        const name = s.slice(i + 1, j);
        if (s[j] === '*' && name === 'operatorname') j++; // \operatorname*
        out.push({ k: 'cmd', v: name });
        i = j - 1;
        continue;
      }
      out.push({ k: 'cmd', v: n });
      i++;
      continue;
    }
    if (c === '%') {
      // chú thích tới hết dòng
      while (i < s.length && s[i] !== '\n') i++;
      continue;
    }
    if (c === '{') out.push({ k: '{' });
    else if (c === '}') out.push({ k: '}' });
    else if (c === '^') out.push({ k: '^' });
    else if (c === '_') out.push({ k: '_' });
    else if (c === '&') out.push({ k: '&' });
    else if (/\s/.test(c)) {
      if (out.length && out[out.length - 1].k !== 'sp') out.push({ k: 'sp' });
    } else if (c === '~') out.push({ k: 'ch', v: ' ' });
    else {
      // giữ nguyên cặp surrogate (ký tự ngoài BMP)
      const cp = s.codePointAt(i)!;
      const chs = String.fromCodePoint(cp);
      out.push({ k: 'ch', v: chs });
      i += chs.length - 1;
    }
  }
  return out;
}

// ===================== Cây công thức =====================

type Sty = 'i' | 'p' | 'b' | 'bi' | 'nor' | 'amp'; // amp = điểm căn hàng & trong eqArr
type Node =
  | { t: 'run'; text: string; sty?: Sty }
  | { t: 'frac'; num: Node[]; den: Node[]; noBar?: boolean; small?: boolean }
  | { t: 'scr'; base: Node[]; sub?: Node[]; sup?: Node[] }
  | { t: 'rad'; deg: Node[] | null; e: Node[] }
  | { t: 'nary'; chr: string; under: boolean; sub?: Node[]; sup?: Node[]; e: Node[] }
  | { t: 'func'; name: Node[]; e: Node[] }
  | { t: 'lim'; pos: 'low' | 'upp'; e: Node[]; lim: Node[] }
  | { t: 'acc'; chr: string; e: Node[] }
  | { t: 'bar'; pos: 'top' | 'bot'; e: Node[] }
  | { t: 'grp'; chr: string; pos: 'top' | 'bot'; e: Node[] }
  | { t: 'd'; beg: string; end: string; e: Node[] }
  | { t: 'eqArr'; rows: Node[][] }
  | { t: 'mat'; rows: Node[][][] }
  | { t: 'box'; e: Node[] };

class Parser {
  i = 0;
  unknown = new Set<string>();
  constructor(private toks: Tok[]) {}

  peek(): Tok | undefined {
    return this.toks[this.i];
  }
  skipSp() {
    while (this.peek()?.k === 'sp') this.i++;
  }

  /** Đọc dãy nút tới khi gặp '}' / '&' / '\\' / \end / \right (không tiêu thụ ký tự dừng) */
  seq(stop: { brace?: boolean; cell?: boolean; right?: boolean; end?: boolean } = {}): Node[] {
    const out: Node[] = [];
    while (this.i < this.toks.length) {
      const t = this.peek()!;
      if (t.k === '}') {
        if (stop.brace) break;
        this.i++; // ngoặc thừa → bỏ
        continue;
      }
      if ((t.k === '&' || t.k === 'nl') && stop.cell) break;
      if (t.k === 'cmd' && t.v === 'right' && stop.right) break;
      if (t.k === 'cmd' && t.v === 'end' && stop.end) break;
      if (t.k === 'cmd' && (t.v === 'middle')) {
        this.i++;
        const d = this.delim();
        out.push({ t: 'run', text: d || '|', sty: 'p' });
        continue;
      }
      const atom = this.atom(stop);
      if (!atom) continue;
      const withScripts = this.scripts(atom);
      // N-ary: phần thân là phần còn lại của dãy
      const last = withScripts[withScripts.length - 1];
      if (last && last.t === 'nary') {
        out.push(...withScripts.slice(0, -1));
        last.e = this.seq(stop);
        out.push(last);
        break;
      }
      out.push(...withScripts);
    }
    return out;
  }

  /** Một đối số: {…} hoặc 1 token */
  arg(): Node[] {
    this.skipSp();
    const t = this.peek();
    if (!t) return [];
    if (t.k === '{') {
      this.i++;
      const r = this.seq({ brace: true });
      if (this.peek()?.k === '}') this.i++;
      return r;
    }
    const a = this.atom({});
    return a ? [a] : [];
  }

  /** Đối số tuỳ chọn [...] (đọc thô thành nút) */
  optArg(): Node[] | null {
    this.skipSp();
    const t = this.peek();
    if (!t || t.k !== 'ch' || t.v !== '[') return null;
    this.i++;
    const out: Node[] = [];
    let depth = 0;
    const start = this.i;
    while (this.i < this.toks.length) {
      const x = this.peek()!;
      if (x.k === '{') depth++;
      if (x.k === '}') depth--;
      if (x.k === 'ch' && x.v === ']' && depth === 0) break;
      this.i++;
    }
    const sub = new Parser(this.toks.slice(start, this.i));
    out.push(...sub.seq({}));
    sub.unknown.forEach((u) => this.unknown.add(u));
    if (this.peek()?.k === 'ch') this.i++; // ]
    return out;
  }

  /** Đọc thô nội dung {…} thành chuỗi (cho \text, \begin{…}, \operatorname) */
  rawArg(): string {
    this.skipSp();
    const t = this.peek();
    if (!t) return '';
    if (t.k !== '{') {
      this.i++;
      return tokText(t);
    }
    this.i++;
    let depth = 1;
    let s = '';
    while (this.i < this.toks.length) {
      const x = this.toks[this.i++];
      if (x.k === '{') {
        depth++;
        s += '{';
        continue;
      }
      if (x.k === '}') {
        depth--;
        if (depth === 0) break;
        s += '}';
        continue;
      }
      s += tokText(x);
    }
    return s;
  }

  delim(): string {
    this.skipSp();
    const t = this.peek();
    if (!t) return '';
    this.i++;
    if (t.k === 'ch') return t.v === '.' ? '' : t.v;
    if (t.k === 'cmd') {
      const map: Record<string, string> = {
        '{': '{', '}': '}', '|': '‖', lbrace: '{', rbrace: '}', langle: '⟨', rangle: '⟩',
        lvert: '|', rvert: '|', vert: '|', Vert: '‖', lVert: '‖', rVert: '‖', lfloor: '⌊',
        rfloor: '⌋', lceil: '⌈', rceil: '⌉', lbrack: '[', rbrack: ']', backslash: '\\',
      };
      return map[t.v] ?? '';
    }
    return '';
  }

  /** Gắn ^ _ (và dấu ' ) vào nút vừa đọc */
  scripts(atom: Node): Node[] {
    let sub: Node[] | undefined;
    let sup: Node[] | undefined;
    let primes = '';
    for (;;) {
      const save = this.i;
      this.skipSp();
      const t = this.peek();
      if (t?.k === '^' && !sup) {
        this.i++;
        sup = this.arg();
        continue;
      }
      if (t?.k === '_' && !sub) {
        this.i++;
        sub = this.arg();
        continue;
      }
      if (t?.k === 'ch' && t.v === "'" ) {
        this.i++;
        primes += '′';
        continue;
      }
      if (t?.k === 'cmd' && (t.v === 'limits' || t.v === 'nolimits' || t.v === 'displaylimits')) {
        this.i++;
        continue;
      }
      this.i = save;
      break;
    }
    if (primes) {
      if (sup) sup = [{ t: 'run', text: primes }, ...sup];
      else if (atom.t === 'run' && !sub) return [{ ...atom, text: atom.text + primes }];
      else sup = [{ t: 'run', text: primes }];
    }
    if (!sub && !sup) return [atom];
    if (atom.t === 'nary') {
      atom.sub = sub;
      atom.sup = sup;
      return [atom];
    }
    // \underbrace{…}_{chú thích} / \overbrace{…}^{…} → chú thích nằm dưới/trên ngoặc
    if (atom.t === 'grp' && ((atom.pos === 'bot' && sub && !sup) || (atom.pos === 'top' && sup && !sub))) {
      return [{ t: 'lim', pos: atom.pos === 'bot' ? 'low' : 'upp', e: [atom], lim: (sub || sup)! }];
    }
    if (atom.t === 'func' && atom.name.length === 1 && (atom.name[0] as any).limop) {
      // \lim_{x\to 0} → giới hạn dưới
      const nm = atom.name[0];
      const low: Node = sub ? { t: 'lim', pos: 'low', e: [nm], lim: sub } : nm;
      const both: Node = sup ? { t: 'lim', pos: 'upp', e: [low], lim: sup } : low;
      return [{ t: 'func', name: [both], e: atom.e }];
    }
    if (atom.t === 'func') {
      return [{ t: 'func', name: [{ t: 'scr', base: atom.name, sub, sup }], e: atom.e }];
    }
    // Chỉ số trên chữ dài (vd "x1"): chỉ gắn vào ký tự cuối
    if (atom.t === 'run' && atom.text.length > 1 && atom.sty !== 'nor' && atom.sty !== 'p') {
      const chars = Array.from(atom.text);
      const lastCh = chars.pop()!;
      return [
        { ...atom, text: chars.join('') },
        { t: 'scr', base: [{ ...atom, text: lastCh }], sub, sup },
      ];
    }
    return [{ t: 'scr', base: [atom], sub, sup }];
  }

  atom(stop: any): Node | null {
    const t = this.peek();
    if (!t) return null;
    this.i++;
    switch (t.k) {
      case 'sp':
        return null;
      case '{': {
        const r = this.seq({ brace: true });
        if (this.peek()?.k === '}') this.i++;
        // nhóm {…} → giữ thành 1 khối (để ^ _ gắn cả nhóm)
        if (r.length === 1) return r[0];
        return { t: 'box', e: r };
      }
      case '}':
        return null;
      case '^':
      case '_': {
        // ^ đứng đầu (vd ^{2}x) → chỉ số trên khoảng trống
        const a = this.arg();
        return { t: 'scr', base: [{ t: 'run', text: '' }], [t.k === '^' ? 'sup' : 'sub']: a } as Node;
      }
      case '&':
        return { t: 'run', text: ' ' };
      case 'nl':
        return null;
      case 'ch':
        return { t: 'run', text: t.v };
      case 'cmd':
        return this.command(t.v, stop);
    }
    return null;
  }

  command(name: string, stop: any): Node | null {
    // ký tự đặc biệt dạng \{ \} \% \$ \# \& \_ \|
    const LIT: Record<string, string> = {
      '{': '{', '}': '}', '%': '%', $: '$', '#': '#', '&': '&', _: '_', '|': '‖',
    };
    if (LIT[name] !== undefined) return { t: 'run', text: LIT[name], sty: 'p' };
    if (SPACES[name] !== undefined) return SPACES[name] ? { t: 'run', text: SPACES[name], sty: 'p' } : null;
    if (SYM[name]) return { t: 'run', text: SYM[name], sty: /^[A-Z]/.test(name) && name.length > 1 && /[α-ωΑ-Ω]/.test(SYM[name]) ? 'p' : undefined };

    switch (name) {
      case 'frac':
      case 'dfrac':
      case 'tfrac':
      case 'cfrac': {
        this.optArg();
        const num = this.arg();
        const den = this.arg();
        return { t: 'frac', num, den, small: name === 'tfrac' };
      }
      case 'binom':
      case 'dbinom':
      case 'tbinom': {
        const n = this.arg();
        const k = this.arg();
        return { t: 'd', beg: '(', end: ')', e: [{ t: 'frac', num: n, den: k, noBar: true }] };
      }
      case 'sqrt': {
        const deg = this.optArg();
        const e = this.arg();
        return { t: 'rad', deg, e };
      }
      case 'left': {
        const beg = this.delim();
        const e = this.seq({ ...stop, right: true, brace: stop.brace });
        let end = '';
        if (this.peek()?.k === 'cmd' && (this.peek() as any).v === 'right') {
          this.i++;
          end = this.delim();
        }
        return { t: 'd', beg, end, e };
      }
      case 'right':
        this.delim();
        return null;
      case 'big': case 'Big': case 'bigg': case 'Bigg':
      case 'bigl': case 'Bigl': case 'biggl': case 'Biggl':
      case 'bigr': case 'Bigr': case 'biggr': case 'Biggr':
      case 'bigm': case 'Bigm': {
        const d = this.delim();
        return d ? { t: 'run', text: d, sty: 'p' } : null;
      }
      case 'text': case 'textrm': case 'textnormal': case 'mbox': case 'hbox': case 'textup':
      case 'textit': case 'textbf': case 'emph': case 'textsf': case 'texttt': {
        const raw = this.rawArg();
        const txt = textArgToPlain(raw);
        return { t: 'run', text: txt, sty: name === 'textbf' ? 'b' : 'nor' };
      }
      case 'mathrm': case 'rm': case 'mathup': case 'operatorname': case 'mathsf': case 'mathtt': {
        const raw = name === 'rm' ? '' : this.rawArg();
        if (name === 'operatorname') {
          const nm: Node = { t: 'run', text: textArgToPlain(raw), sty: 'p' };
          return { t: 'func', name: [nm], e: this.funcBody() };
        }
        return raw ? { t: 'run', text: mathTextPlain(raw), sty: 'p' } : null;
      }
      case 'mathbf': case 'boldsymbol': case 'bm': case 'pmb': {
        const raw = this.rawArg();
        return { t: 'run', text: mathTextPlain(raw), sty: 'b' };
      }
      case 'mathit': {
        const raw = this.rawArg();
        return { t: 'run', text: mathTextPlain(raw), sty: 'i' };
      }
      case 'mathbb': case 'Bbb': case 'mathbbm': case 'mathcal': case 'mathscr': case 'mathfrak': {
        const raw = mathTextPlain(this.rawArg());
        const kind = name.startsWith('mathcal') || name === 'mathscr' ? 'cal' : name === 'mathfrak' ? 'frak' : 'bb';
        return { t: 'run', text: mapAlpha(raw, kind), sty: 'p' };
      }
      case 'overline': {
        return { t: 'bar', pos: 'top', e: this.arg() };
      }
      case 'underline': {
        return { t: 'bar', pos: 'bot', e: this.arg() };
      }
      case 'overparen': case 'wideparen': case 'arc': case 'overarc': case 'cung': {
        return { t: 'grp', chr: '⏜', pos: 'top', e: this.arg() };
      }
      case 'overbrace': {
        return { t: 'grp', chr: '⏞', pos: 'top', e: this.arg() };
      }
      case 'underbrace': {
        return { t: 'grp', chr: '⏟', pos: 'bot', e: this.arg() };
      }
      case 'overset': case 'stackrel': {
        const top = this.arg();
        const base = this.arg();
        return { t: 'lim', pos: 'upp', e: base, lim: top };
      }
      case 'underset': {
        const bot = this.arg();
        const base = this.arg();
        return { t: 'lim', pos: 'low', e: base, lim: bot };
      }
      case 'xrightarrow': case 'xleftarrow': {
        const below = this.optArg();
        const above = this.arg();
        const arrow: Node = { t: 'run', text: name === 'xrightarrow' ? '→' : '←', sty: 'p' };
        let n: Node = { t: 'lim', pos: 'upp', e: [arrow], lim: above };
        if (below) n = { t: 'lim', pos: 'low', e: [n], lim: below };
        return n;
      }
      case 'boxed': case 'fbox': {
        return { t: 'box', e: this.arg() };
      }
      case 'hline': case 'midrule': case 'toprule': case 'bottomrule':
        return null;
      case 'cline': case 'cmidrule':
        this.rawArg();
        return null;
      case 'mathop': case 'mathrel': case 'mathbin': case 'mathord': case 'mathpunct': {
        const a = this.arg();
        return a.length === 1 ? a[0] : { t: 'box', e: a };
      }
      case 'displaystyle': case 'textstyle': case 'scriptstyle': case 'scriptscriptstyle':
      case 'limits': case 'nolimits': case 'nonumber': case 'notag': case 'label':
      case 'mathstrut': case 'strut': case 'relax': case 'allowbreak': case 'protect':
      case 'phantom': case 'hphantom': case 'vphantom': case 'tag': case 'color':
      case 'normalsize': case 'small': case 'large': case 'Large': case 'footnotesize':
      case 'bf': case 'it': case 'cal': case 'mathstyle': {
        if (['label', 'tag', 'color', 'phantom', 'hphantom', 'vphantom'].includes(name)) this.rawArg();
        return null;
      }
      case 'textcolor': case 'colorbox': {
        this.rawArg();
        return { t: 'box', e: this.arg() };
      }
      case 'not': {
        const nx = this.atom({});
        if (nx && nx.t === 'run') {
          const neg: Record<string, string> = { '=': '≠', '∈': '∉', '⊂': '⊄', '⊆': '⊈', '<': '≮', '>': '≯', '≤': '≰', '≥': '≱', '∥': '∦', '|': '∤', '≡': '≢', '∃': '∄' };
          return { t: 'run', text: neg[nx.text] || nx.text + '̸' };
        }
        return nx;
      }
      case 'heva': case 'hoac': case 'system': {
        // \heva{&a\\&b} — hệ (ngoặc nhọn) / \hoac{…} — hoặc (ngoặc vuông)
        const rows = this.rowsInGroup();
        return {
          t: 'd',
          beg: name === 'hoac' ? '[' : '{',
          end: '',
          // dòng không có & → thêm điểm căn ở đầu để các dòng căn trái như trên giấy
          e: [{ t: 'eqArr', rows: rows.map((r) => (r.length === 1 ? [AMP(), ...r[0]] : joinCells(r, '', true))) }],
        };
      }
      case 'abs': {
        return { t: 'd', beg: '|', end: '|', e: this.arg() };
      }
      case 'norm': {
        return { t: 'd', beg: '‖', end: '‖', e: this.arg() };
      }
      case 'begin':
        return this.environment(this.rawArg());
      case 'end':
        this.rawArg();
        return null;
    }

    if (ACCENTS[name]) {
      return { t: 'acc', chr: ACCENTS[name], e: this.arg() };
    }
    if (NARY[name]) {
      return { t: 'nary', chr: NARY[name].chr, under: NARY[name].under, e: [] };
    }
    if (FUNCS.has(name) || LIMOPS.has(name)) {
      const nm: any = { t: 'run', text: name, sty: 'p' };
      if (LIMOPS.has(name)) nm.limop = true;
      // \lim cần đọc _ trước khi lấy thân hàm
      if (LIMOPS.has(name)) {
        const save = this.i;
        this.skipSp();
        if (this.peek()?.k === '_' || this.peek()?.k === '^' || (this.peek()?.k === 'cmd' && ['limits', 'nolimits'].includes((this.peek() as any).v))) {
          this.i = save;
          const scr = this.scripts({ t: 'func', name: [nm], e: [] });
          const f = scr[0] as any;
          f.e = this.funcBody();
          return f;
        }
        this.i = save;
      }
      // \log_2 x, \sin^2 x: chỉ số gắn vào tên hàm
      const save = this.i;
      this.skipSp();
      if (this.peek()?.k === '_' || this.peek()?.k === '^') {
        this.i = save;
        const scr = this.scripts({ t: 'func', name: [nm], e: [] });
        const f = scr[0] as any;
        f.e = this.funcBody();
        return f;
      }
      this.i = save;
      return { t: 'func', name: [nm], e: this.funcBody() };
    }
    // Lệnh lạ: giữ đối số {…} nếu có, không thì in tên lệnh (chữ đứng)
    this.unknown.add(name);
    this.skipSp();
    if (this.peek()?.k === '{') {
      const e = this.arg();
      return e.length === 1 ? e[0] : { t: 'box', e };
    }
    return { t: 'run', text: name, sty: 'p' };
  }

  /** Thân của hàm số: 1 nguyên tử kế tiếp (kèm chỉ số) */
  funcBody(): Node[] {
    this.skipSp();
    const t = this.peek();
    if (!t || t.k === '}' || t.k === '&' || t.k === 'nl') return [];
    if (t.k === 'cmd' && ['right', 'end'].includes(t.v)) return [];
    if (t.k === 'ch' && /[+\-=<>,;)\]]/.test(t.v)) return [];
    const a = this.atom({});
    if (!a) return [];
    return this.scripts(a);
  }

  /** {…} chứa các dòng/ô (cho \heva, \hoac) */
  rowsInGroup(): Node[][][] {
    this.skipSp();
    if (this.peek()?.k !== '{') return [[this.arg()]];
    this.i++;
    const rows = this.rows({ brace: true });
    if (this.peek()?.k === '}') this.i++;
    return rows;
  }

  /** Đọc các dòng (\\) và ô (&) tới khi gặp dấu dừng */
  rows(stop: { brace?: boolean; end?: boolean }): Node[][][] {
    const rows: Node[][][] = [];
    let row: Node[][] = [];
    for (;;) {
      const cell = this.seq({ ...stop, cell: true });
      row.push(cell);
      const t = this.peek();
      if (t?.k === '&') {
        this.i++;
        continue;
      }
      if (t?.k === 'nl') {
        this.i++;
        rows.push(row);
        row = [];
        continue;
      }
      break;
    }
    if (row.length && !(row.length === 1 && !row[0].length)) rows.push(row);
    // bỏ \hline (đã thành run rỗng) và dòng trống cuối
    return rows.filter((r) => r.some((c) => c.length));
  }

  environment(env: string): Node | null {
    const name = env.replace(/\*$/, '');
    const spec = name === 'array' || name === 'tabular' ? this.rawArg() : ''; // {cc|c}
    if (name === 'alignedat' || name === 'alignat') this.rawArg();
    if (name === 'aligned' || name === 'gathered') this.optArg();
    const rows = this.rows({ end: true });
    // tiêu thụ \end{…}
    if (this.peek()?.k === 'cmd' && (this.peek() as any).v === 'end') {
      this.i++;
      this.rawArg();
    }
    const D: Record<string, [string, string]> = {
      pmatrix: ['(', ')'], bmatrix: ['[', ']'], Bmatrix: ['{', '}'], vmatrix: ['|', '|'],
      Vmatrix: ['‖', '‖'], smallmatrix: ['', ''], matrix: ['', ''], array: ['', ''],
      tabular: ['', ''],
    };
    // \left\{\begin{array}{l}…\end{array}\right. (cách viết hệ phổ biến) → hệ căn trái/phải
    const cols = spec.replace(/@\{[^}]*\}|[|\s{}]/g, '');
    if (name === 'array' && cols.length === 1 && rows.every((r) => r.length === 1)) {
      const lead: Node[] = cols === 'l' ? [{ t: 'run', text: '&', sty: 'amp' }] : [];
      return { t: 'eqArr', rows: rows.map((r) => [...lead, ...r[0]]) };
    }
    if (D[name]) {
      const mat: Node = { t: 'mat', rows };
      return D[name][0] || D[name][1] ? { t: 'd', beg: D[name][0], end: D[name][1], e: [mat] } : mat;
    }
    if (name === 'cases' || name === 'dcases' || name === 'rcases') {
      const arr: Node = { t: 'eqArr', rows: rows.map((r) => joinCells(r, '\u2003', true)) };
      return name === 'rcases'
        ? { t: 'd', beg: '', end: '}', e: [arr] }
        : { t: 'd', beg: '{', end: '', e: [arr] };
    }
    // aligned, align, gathered, split, eqnarray, gather, multline, equation…
    if (rows.length <= 1) return { t: 'box', e: joinCells(rows[0] || []) };
    return { t: 'eqArr', rows: rows.map((r) => joinCells(r, '', true)) };
  }
}

const AMP = (): Node => ({ t: 'run', text: '&', sty: 'amp' });

// Nối các ô của 1 dòng; align=true → chèn điểm căn hàng & (Word/MathType căn các dòng theo &)
function joinCells(cells: Node[][], sep = '', align = false): Node[] {
  const out: Node[] = [];
  cells.forEach((c, i) => {
    if (i && align) out.push({ t: 'run', text: '&', sty: 'amp' });
    if (i && sep) out.push({ t: 'run', text: sep, sty: 'p' });
    out.push(...c);
  });
  return out;
}

function tokText(t: Tok): string {
  switch (t.k) {
    case 'cmd':
      return '\\' + t.v + (/^[a-zA-Z]/.test(t.v) ? ' ' : '');
    case 'ch':
      return t.v;
    case '{':
      return '{';
    case '}':
      return '}';
    case '^':
      return '^';
    case '_':
      return '_';
    case '&':
      return '&';
    case 'nl':
      return '\\\\';
    case 'sp':
      return ' ';
  }
}

// Chữ trong \text{…}: bỏ lệnh định dạng, giữ chữ; $…$ lồng trong → bỏ dấu $
function textArgToPlain(raw: string): string {
  return String(raw || '')
    .replace(/\\(?:textbf|textit|emph|text|mathrm|mbox)\s*\{([^{}]*)\}/g, '$1')
    .replace(/\\([%$#&_{}])/g, '$1')
    .replace(/\\(?:quad|qquad)\s*/g, ' ')
    .replace(/\\[,;:! ]/g, ' ')
    .replace(/\$/g, '')
    .replace(/~/g, ' ')
    .replace(/\\[a-zA-Z]+\s*/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ');
}

function mathTextPlain(raw: string): string {
  return String(raw || '').replace(/\\[,;:! ]/g, ' ').replace(/[{}\s]/g, '').replace(/\\([a-zA-Z]+)/g, (m, n) => SYM[n] || n);
}

// ===================== Xuất XML =====================

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const RFONT_MATH = '<w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/></w:rPr>';
const RFONT_TEXT =
  '<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/></w:rPr>';

function runXml(text: string, sty?: Sty): string {
  if (!text) return '';
  let mpr = '';
  if (sty === 'nor') mpr = '<m:rPr><m:nor/></m:rPr>';
  else if (sty === 'p' || sty === 'amp') mpr = '<m:rPr><m:sty m:val="p"/></m:rPr>';
  else if (sty === 'b') mpr = '<m:rPr><m:sty m:val="b"/></m:rPr>';
  else if (sty === 'bi') mpr = '<m:rPr><m:sty m:val="bi"/></m:rPr>';
  const font = sty === 'nor' ? RFONT_TEXT : RFONT_MATH;
  return `<m:r>${mpr}${font}<m:t xml:space="preserve">${esc(text)}</m:t></m:r>`;
}

function seqXml(nodes: Node[]): string {
  // gộp các run liền nhau cùng kiểu
  let out = '';
  let buf = '';
  let bufSty: Sty | undefined;
  let has = false;
  const flush = () => {
    if (has) out += runXml(buf, bufSty);
    buf = '';
    has = false;
  };
  for (const n of nodes) {
    if (n.t === 'run') {
      if (has && bufSty === n.sty && n.sty !== 'amp') buf += n.text;
      else {
        flush();
        buf = n.text;
        bufSty = n.sty;
        has = true;
      }
      continue;
    }
    flush();
    out += nodeXml(n);
  }
  flush();
  return out;
}

function e(nodes: Node[], tag = 'm:e'): string {
  const inner = seqXml(nodes);
  return `<${tag}>${inner}</${tag}>`;
}

function chrVal(c: string): string {
  return `m:val="${esc(c)}"`;
}

function nodeXml(n: Node): string {
  switch (n.t) {
    case 'run':
      return runXml(n.text, n.sty);
    case 'box':
      return seqXml(n.e);
    case 'frac':
      return (
        '<m:f>' +
        (n.noBar ? '<m:fPr><m:type m:val="noBar"/></m:fPr>' : n.small ? '<m:fPr><m:type m:val="lin"/></m:fPr>' : '') +
        e(n.num, 'm:num') +
        e(n.den, 'm:den') +
        '</m:f>'
      );
    case 'scr': {
      if (n.sub && n.sup) return '<m:sSubSup>' + e(n.base) + e(n.sub, 'm:sub') + e(n.sup, 'm:sup') + '</m:sSubSup>';
      if (n.sup) return '<m:sSup>' + e(n.base) + e(n.sup, 'm:sup') + '</m:sSup>';
      return '<m:sSub>' + e(n.base) + e(n.sub || [], 'm:sub') + '</m:sSub>';
    }
    case 'rad':
      return n.deg && n.deg.length
        ? '<m:rad>' + e(n.deg, 'm:deg') + e(n.e) + '</m:rad>'
        : '<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/>' + e(n.e) + '</m:rad>';
    case 'nary': {
      const pr =
        '<m:naryPr>' +
        (n.chr === '∫' ? '' : `<m:chr ${chrVal(n.chr)}/>`) +
        `<m:limLoc m:val="${n.under ? 'undOvr' : 'subSup'}"/>` +
        (n.sub ? '' : '<m:subHide m:val="1"/>') +
        (n.sup ? '' : '<m:supHide m:val="1"/>') +
        '</m:naryPr>';
      return '<m:nary>' + pr + e(n.sub || [], 'm:sub') + e(n.sup || [], 'm:sup') + e(n.e) + '</m:nary>';
    }
    case 'func':
      return '<m:func>' + e(n.name, 'm:fName') + e(n.e) + '</m:func>';
    case 'lim':
      return n.pos === 'low'
        ? '<m:limLow>' + e(n.e) + e(n.lim, 'm:lim') + '</m:limLow>'
        : '<m:limUpp>' + e(n.e) + e(n.lim, 'm:lim') + '</m:limUpp>';
    case 'acc':
      return `<m:acc><m:accPr><m:chr ${chrVal(n.chr)}/></m:accPr>` + e(n.e) + '</m:acc>';
    case 'bar':
      return `<m:bar><m:barPr><m:pos m:val="${n.pos}"/></m:barPr>` + e(n.e) + '</m:bar>';
    case 'grp':
      return (
        `<m:groupChr><m:groupChrPr><m:chr ${chrVal(n.chr)}/><m:pos m:val="${n.pos}"/>` +
        `<m:vertJc m:val="${n.pos === 'top' ? 'bot' : 'top'}"/></m:groupChrPr>` +
        e(n.e) +
        '</m:groupChr>'
      );
    case 'd':
      return (
        `<m:d><m:dPr><m:begChr ${chrVal(n.beg)}/><m:endChr ${chrVal(n.end)}/></m:dPr>` +
        e(n.e) +
        '</m:d>'
      );
    case 'eqArr':
      return '<m:eqArr>' + n.rows.map((r) => e(r)).join('') + '</m:eqArr>';
    case 'mat': {
      const cols = Math.max(1, ...n.rows.map((r) => r.length));
      const mpr = `<m:mPr><m:mcs><m:mc><m:mcPr><m:count m:val="${cols}"/><m:mcJc m:val="center"/></m:mcPr></m:mc></m:mcs></m:mPr>`;
      return (
        '<m:m>' +
        mpr +
        n.rows
          .map((r) => {
            const cells = [...r];
            while (cells.length < cols) cells.push([]);
            return '<m:mr>' + cells.map((c) => e(c)).join('') + '</m:mr>';
          })
          .join('') +
        '</m:m>'
      );
    }
  }
  return '';
}

// ===================== API =====================

/** Chuẩn hoá trước khi phân tích: macro VN hay gặp → dạng chuẩn */
function preprocess(tex: string): string {
  return String(tex || '')
    .replace(/\\dint(?![a-zA-Z])/g, '\\int');
}

/** LaTeX (nội dung công thức, KHÔNG gồm $) → <m:oMath>…</m:oMath> */
export function latexToOmml(tex: string): OmmlResult {
  const p = new Parser(tokenize(preprocess(tex)));
  // Toàn công thức có thể có \\ (nhiều dòng) → mỗi dòng 1 hàng eqArr
  const rows = p.rows({});
  let body: string;
  if (rows.length > 1) {
    body = '<m:eqArr>' + rows.map((r) => e(joinCells(r, '', true))).join('') + '</m:eqArr>';
  } else {
    body = seqXml(joinCells(rows[0] || []));
  }
  return { xml: `<m:oMath>${body}</m:oMath>`, unknown: Array.from(p.unknown) };
}

/** Công thức hiển thị (dòng riêng, căn giữa) */
export function latexToOmmlPara(tex: string): OmmlResult {
  const r = latexToOmml(tex);
  return {
    xml: `<m:oMathPara><m:oMathParaPr><m:jc m:val="center"/></m:oMathParaPr>${r.xml}</m:oMathPara>`,
    unknown: r.unknown,
  };
}
