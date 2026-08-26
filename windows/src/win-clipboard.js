// CF_HDROP encode/decode — lets Ctrl+C/Ctrl+V move real files between
// ClutterDock and Explorer. The DROPFILES struct is a 20-byte header
// (pFiles offset, drop point, fNC, fWide) followed by null-terminated
// strings and a final empty string.

const HEADER_SIZE = 20;

/** Build a CF_HDROP buffer (wide strings) from absolute file paths. */
function buildHDrop(paths) {
  const clean = (paths || []).filter((p) => typeof p === 'string' && p.length);
  if (!clean.length) return null;
  const strings = Buffer.from(clean.map((p) => p + '\0').join('') + '\0', 'utf16le');
  const header = Buffer.alloc(HEADER_SIZE);
  header.writeUInt32LE(HEADER_SIZE, 0); // pFiles: offset to the string list
  // pt (8 bytes) and fNC stay zero
  header.writeUInt32LE(1, 16); // fWide: UTF-16
  return Buffer.concat([header, strings]);
}

/** Parse a CF_HDROP buffer into file paths (empty array when malformed). */
function parseHDrop(buf) {
  try {
    if (!Buffer.isBuffer(buf) || buf.length <= HEADER_SIZE) return [];
    const offset = buf.readUInt32LE(0);
    const wide = buf.readUInt32LE(16) !== 0;
    if (offset >= buf.length) return [];
    const paths = [];
    if (wide) {
      let pos = offset;
      let current = '';
      while (pos + 1 < buf.length) {
        const code = buf.readUInt16LE(pos);
        pos += 2;
        if (code === 0) {
          if (!current) break; // double null: end of list
          paths.push(current);
          current = '';
        } else {
          current += String.fromCharCode(code);
        }
      }
    } else {
      let current = '';
      for (let pos = offset; pos < buf.length; pos++) {
        const code = buf[pos];
        if (code === 0) {
          if (!current) break;
          paths.push(current);
          current = '';
        } else {
          current += String.fromCharCode(code);
        }
      }
    }
    return paths;
  } catch (_) {
    return [];
  }
}

module.exports = { buildHDrop, parseHDrop };
