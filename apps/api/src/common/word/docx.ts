/**
 * Ghi tài liệu Word (.docx) từ các khối — tự viết XML WordprocessingML, đóng gói bằng zip.ts.
 * Công thức là OMML (phương trình gốc của Word). Không dùng thư viện ngoài.
 */
import { Block, Inline, ImgData } from './blocks';
import { buildZip } from './zip';

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

export type PageSetup = {
  top: number; // twips
  bottom: number;
  left: number;
  right: number;
  fontSize?: number; // pt
  font?: string;
};

export const A4 = { w: 11906, h: 16838 };

function x(s: string): string {
  return String(s ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export class DocxWriter {
  private media: { name: string; data: Buffer; rid: string }[] = [];
  private picId = 1;

  constructor(private page: PageSetup) {}

  get contentWidth(): number {
    return A4.w - this.page.left - this.page.right;
  }

  private imageXml(img: ImgData): string {
    const n = this.media.length + 1;
    const ext = img.type === 'jpeg' ? 'jpeg' : 'png';
    const name = `image${n}.${ext}`;
    const rid = `rIdImg${n}`;
    this.media.push({ name, data: img.data, rid });
    const cx = Math.round(img.w * 9525);
    const cy = Math.round(img.h * 9525);
    const id = this.picId++;
    return (
      '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">' +
      `<wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Hình ${id}"/>` +
      '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      `<pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>' +
      '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>'
    );
  }

  runsXml(runs: Inline[]): string {
    let out = '';
    for (const r of runs) {
      if (r.k === 'br') out += '<w:r><w:br/></w:r>';
      else if (r.k === 'math') out += r.xml;
      else if (r.k === 'img') out += this.imageXml(r.img);
      else if (r.text) {
        let pr = '';
        if (r.b) pr += '<w:b/><w:bCs/>';
        if (r.i) pr += '<w:i/><w:iCs/>';
        // thứ tự theo chuẩn CT_RPr: b, i, …, color, …, u
        if (r.color) pr += `<w:color w:val="${r.color}"/>`;
        if (r.u) pr += '<w:u w:val="single"/>';
        // tab giữ dạng \t trong text → w:tab
        const parts = r.text.split('\t');
        parts.forEach((t, i) => {
          if (i) out += `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ''}<w:tab/></w:r>`;
          if (t) out += `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ''}<w:t xml:space="preserve">${x(t)}</w:t></w:r>`;
        });
      }
    }
    return out;
  }

  blockXml(b: Block): string {
    if (b.k === 'math') return `<w:p><w:pPr><w:spacing w:before="40" w:after="40"/></w:pPr>${b.xml}</w:p>`;
    if (b.k === 'p') {
      let ppr = '';
      if (b.keepNext) ppr += '<w:keepNext/>';
      if (b.before !== undefined || b.after !== undefined) {
        ppr += `<w:spacing${b.before !== undefined ? ` w:before="${b.before}"` : ''}${b.after !== undefined ? ` w:after="${b.after}"` : ''}/>`;
      }
      if (b.indent || b.hanging) {
        ppr += `<w:ind w:left="${b.indent || 0}"${b.hanging ? ` w:hanging="${b.hanging}"` : ''}/>`;
      }
      if (b.align) ppr += `<w:jc w:val="${b.align === 'both' ? 'both' : b.align}"/>`;
      return `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${this.runsXml(b.runs)}</w:p>`;
    }
    // bảng
    const widths = b.widths;
    const total = widths.reduce((t, w) => t + w, 0);
    const bd = b.borders
      ? '<w:tblBorders>' +
        ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
          .map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`)
          .join('') +
        '</w:tblBorders>'
      : '<w:tblBorders>' +
        ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="nil"/>`).join('') +
        '</w:tblBorders>';
    let xml =
      '<w:tbl><w:tblPr>' +
      `<w:tblW w:w="${total}" w:type="dxa"/>` +
      (b.borders ? '<w:jc w:val="center"/>' : '') +
      bd +
      '<w:tblLayout w:type="fixed"/>' +
      `<w:tblCellMar><w:left w:w="${b.borders ? 90 : 40}" w:type="dxa"/><w:right w:w="${b.borders ? 90 : 40}" w:type="dxa"/></w:tblCellMar>` +
      '<w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/>' +
      '</w:tblPr><w:tblGrid>' +
      widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('') +
      '</w:tblGrid>';
    for (const row of b.rows) {
      xml += '<w:tr><w:trPr><w:cantSplit/></w:trPr>';
      let col = 0;
      for (const cell of row) {
        const span = Math.max(1, Math.min(cell.span || 1, widths.length - col));
        const w = widths.slice(col, col + span).reduce((t, v) => t + v, 0) || widths[0];
        col += span;
        let inner = cell.blocks
          .map((bl) => {
            if (bl.k === 'p' && cell.align && !bl.align) return this.blockXml({ ...bl, align: cell.align });
            return this.blockXml(bl);
          })
          .join('');
        // ô phải kết thúc bằng 1 đoạn văn (quy định của Word)
        const last = cell.blocks[cell.blocks.length - 1];
        if (!last || last.k === 'table') inner += '<w:p/>';
        xml +=
          `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}<w:vAlign w:val="${b.borders ? 'center' : 'top'}"/></w:tcPr>` +
          inner +
          '</w:tc>';
      }
      // thiếu ô → bù ô trống cho đủ lưới
      while (col < widths.length) {
        xml += `<w:tc><w:tcPr><w:tcW w:w="${widths[col]}" w:type="dxa"/></w:tcPr><w:p/></w:tc>`;
        col++;
      }
      xml += '</w:tr>';
    }
    return xml + '</w:tbl>';
  }

  build(blocks: Block[], meta: { title?: string } = {}): Buffer {
    let body = '';
    let prevTable = false;
    for (const b of blocks) {
      // 2 bảng liền nhau → Word gộp làm 1; chèn đoạn rỗng nhỏ ở giữa
      if (b.k === 'table' && prevTable) body += '<w:p><w:pPr><w:spacing w:after="0" w:line="120" w:lineRule="exact"/></w:pPr></w:p>';
      body += this.blockXml(b);
      prevTable = b.k === 'table';
    }
    const pg = this.page;
    const sect =
      `<w:sectPr><w:pgSz w:w="${A4.w}" w:h="${A4.h}"/>` +
      `<w:pgMar w:top="${pg.top}" w:right="${pg.right}" w:bottom="${pg.bottom}" w:left="${pg.left}" w:header="500" w:footer="500" w:gutter="0"/>` +
      '<w:pgNumType w:start="1"/><w:cols w:space="720"/></w:sectPr>';
    const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${NS}><w:body>${body}${sect}</w:body></w:document>`;

    const font = x(pg.font || 'Times New Roman');
    const sz = Math.round((pg.fontSize || 12) * 2);
    const styles =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/>` +
      `<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/><w:lang w:val="vi-VN"/></w:rPr></w:rPrDefault>` +
      '<w:pPrDefault><w:pPr><w:spacing w:after="40" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
      '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/>' +
      '<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
      '</w:styles>';
    const settings =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">' +
      '<w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/>' +
      // thứ tự theo chuẩn CT_Settings: … compat … m:mathPr
      '<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>' +
      '<m:mathPr><m:mathFont m:val="Cambria Math"/><m:brkBin m:val="before"/><m:brkBinSub m:val="--"/><m:smallFrac m:val="0"/><m:dispDef/>' +
      '<m:lMargin m:val="0"/><m:rMargin m:val="0"/><m:defJc m:val="centerGroup"/><m:wrapIndent m:val="1440"/><m:intLim m:val="subSup"/><m:naryLim m:val="undOvr"/></m:mathPr>' +
      '</w:settings>';
    const rels =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '<Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>' +
      this.media
        .map(
          (m) =>
            `<Relationship Id="${m.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.name}"/>`,
        )
        .join('') +
      '</Relationships>';
    const ct =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="png" ContentType="image/png"/>' +
      '<Default Extension="jpeg" ContentType="image/jpeg"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '</Types>';
    const rootRels =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '</Relationships>';
    const core =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      `<dc:title>${x(meta.title || '')}</dc:title><dc:creator>LumiMath</dc:creator>` +
      `<dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created>` +
      '</cp:coreProperties>';

    return buildZip([
      { name: '[Content_Types].xml', data: ct },
      { name: '_rels/.rels', data: rootRels },
      { name: 'docProps/core.xml', data: core },
      { name: 'word/document.xml', data: doc },
      { name: 'word/styles.xml', data: styles },
      { name: 'word/settings.xml', data: settings },
      { name: 'word/_rels/document.xml.rels', data: rels },
      ...this.media.map((m) => ({ name: `word/media/${m.name}`, data: m.data })),
    ]);
  }
}
