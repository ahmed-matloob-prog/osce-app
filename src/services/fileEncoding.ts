/**
 * Decode a text file by working out its encoding rather than assuming UTF-8.
 *
 * Excel and Notepad on an Arabic Windows machine save in the Windows-1256
 * codepage, not UTF-8. Reading such a file as UTF-8 turns every Arabic
 * character into mojibake — "أحمد محمد حسن" arrives as "����?����?���" — and
 * the import reports success, so the damage is only discovered later.
 *
 * Strategy: honour a byte-order mark if present, otherwise try UTF-8 strictly.
 * Arabic encoded as Windows-1256 is almost never valid UTF-8, so a strict
 * decode throws and we fall back. Pure ASCII decodes identically either way,
 * so files without accented characters are unaffected.
 *
 * Shared by the candidate and station importers: both read files a college
 * office produced, on the same machines, with the same defaults.
 */
export async function decodeTextFile(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1256').decode(bytes);
  }
}
