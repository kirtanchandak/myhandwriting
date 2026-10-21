export type KernPair = { left: number; right: number; value: number };

/** At most this many pairs fit in one format 0 subtable, whose length is 16-bit. */
const MAX_PAIRS = Math.floor((0xffff - 14) / 6);

function checksum(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 4) {
    const word =
      i + 4 <= bytes.length
        ? view.getUint32(i)
        : ((bytes[i] << 24) | ((bytes[i + 1] ?? 0) << 16) | ((bytes[i + 2] ?? 0) << 8) | (bytes[i + 3] ?? 0)) >>> 0;
    sum = (sum + word) >>> 0;
  }
  return sum;
}

function binarySearchFields(count: number, size: number) {
  const power = count > 0 ? 2 ** Math.floor(Math.log2(count)) : 0;
  return { searchRange: power * size, entrySelector: power > 0 ? Math.log2(power) : 0, rangeShift: (count - power) * size };
}

/** A version 0 `kern` table with one horizontal subtable of glyph-index pairs. */
export function kernTable(pairs: readonly KernPair[]): Uint8Array {
  const sorted = [...pairs]
    .filter((p) => p.value !== 0)
    .sort((a, b) => a.left - b.left || a.right - b.right)
    .slice(0, MAX_PAIRS);
  const bytes = new Uint8Array(4 + 14 + sorted.length * 6);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0);
  view.setUint16(2, 1);
  view.setUint16(4, 0);
  view.setUint16(6, 14 + sorted.length * 6);
  view.setUint16(8, 0x0001);
  const { searchRange, entrySelector, rangeShift } = binarySearchFields(sorted.length, 6);
  view.setUint16(10, sorted.length);
  view.setUint16(12, searchRange);
  view.setUint16(14, entrySelector);
  view.setUint16(16, rangeShift);
  sorted.forEach((p, i) => {
    view.setUint16(18 + i * 6, p.left);
    view.setUint16(20 + i * 6, p.right);
    view.setInt16(22 + i * 6, Math.max(-32768, Math.min(32767, Math.round(p.value))));
  });
  return bytes;
}

/** Rewrites an OpenType file with an extra table, fixing offsets and checksums. */
export function addTable(font: ArrayBuffer, tag: string, data: Uint8Array): ArrayBuffer {
  const src = new DataView(font);
  const count = src.getUint16(4);
  const tables: Array<{ tag: string; data: Uint8Array }> = [];
  for (let i = 0; i < count; i++) {
    const at = 12 + i * 16;
    const t = String.fromCharCode(src.getUint8(at), src.getUint8(at + 1), src.getUint8(at + 2), src.getUint8(at + 3));
    if (t === tag) continue;
    const offset = src.getUint32(at + 8);
    const length = src.getUint32(at + 12);
    tables.push({ tag: t, data: new Uint8Array(font, offset, length).slice() });
  }
  tables.push({ tag, data });
  tables.sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));

  const headerSize = 12 + tables.length * 16;
  const padded = (n: number) => (n + 3) & ~3;
  const total = tables.reduce((n, t) => n + padded(t.data.length), headerSize);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, src.getUint32(0));
  view.setUint16(4, tables.length);
  const { searchRange, entrySelector, rangeShift } = binarySearchFields(tables.length, 16);
  view.setUint16(6, searchRange);
  view.setUint16(8, entrySelector);
  view.setUint16(10, rangeShift);

  let offset = headerSize;
  let headOffset = -1;
  tables.forEach((t, i) => {
    if (t.tag === "head") new DataView(t.data.buffer, t.data.byteOffset).setUint32(8, 0);
    const at = 12 + i * 16;
    for (let k = 0; k < 4; k++) view.setUint8(at + k, t.tag.charCodeAt(k));
    view.setUint32(at + 4, checksum(t.data));
    view.setUint32(at + 8, offset);
    view.setUint32(at + 12, t.data.length);
    out.set(t.data, offset);
    if (t.tag === "head") headOffset = offset;
    offset += padded(t.data.length);
  });
  if (headOffset >= 0) view.setUint32(headOffset + 8, (0xb1b0afba - checksum(out)) >>> 0);
  return out.buffer;
}
