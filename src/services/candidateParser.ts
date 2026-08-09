import * as XLSX from 'xlsx';
import type { Candidate } from '../types';
import { decodeTextFile } from './fileEncoding';

interface ParsedCandidate {
  candidate: Omit<Candidate, 'id'>;
  /**
   * Circuit number from the file, if it carries one.
   *
   * Kept beside the candidate rather than on it: a student is not in a circuit,
   * they are in a circuit *for a given exam*, and the same person can sit two
   * exams in different circuits.
   */
  circuit?: number;
  warnings: string[];
}

interface ParseResult {
  candidates: ParsedCandidate[];
  errors: string[];
}

/**
 * Parse rows to candidates (shared logic for CSV and Excel)
 */
function parseRows(rows: string[][]): ParseResult {
  const errors: string[] = [];
  const candidates: ParsedCandidate[] = [];

  if (rows.length < 2) {
    return { candidates: [], errors: ['الملف فارغ أو لا يحتوي على بيانات'] };
  }

  // Get headers (first row) - find all columns dynamically
  const headers = rows[0].map(h => (h || '').toString().toLowerCase().trim());

  const findCol = (keywords: string[]) => {
    return headers.findIndex(h => keywords.some(k => h.includes(k)));
  };

  // Name columns are resolved in two passes so a roster carrying both an
  // English and an Arabic name keeps both. Matching a generic "name" in one
  // pass swallowed whichever column came first: a sheet with Name and NameAr
  // put the English name into the Arabic field and dropped the Arabic entirely.
  const arabicNameCol = findCol(['namear', 'name_ar', 'arabicname', 'arabic_name', 'الاسم', 'اسم']);
  const latinNameCol = (() => {
    const explicit = findCol(['nameen', 'name_en', 'englishname', 'english_name']);
    if (explicit >= 0) return explicit;
    // Otherwise any remaining plain "name" column
    return headers.findIndex((h, i) => i !== arabicNameCol && h.includes('name') && !h.includes('number'));
  })();

  const colIndex = {
    candidateNumber: findCol(['candidatenumber', 'candidate_number', 'number', 'رقم', 'الرقم']),
    nameAr: arabicNameCol,
    nameLatin: latinNameCol,
    stage: findCol(['stage', 'المرحلة']),
    group: findCol(['group', 'المجموعة', 'فوج']),
    // Optional. Present, it assigns students to circuits at import time,
    // which is the difference between setting up 450 students at a desk and
    // scanning 450 badges on exam morning.
    circuit: findCol(['circuit', 'الدائرة', 'دائرة']),
  };

  // Required columns: college ID, Arabic name, stage.
  // NameEn and Group are optional; a Latin name alone is not enough, because
  // the roster, the badge and every report are read in Arabic.
  if (colIndex.candidateNumber === -1) {
    errors.push('العمود المطلوب غير موجود: الرقم (ID)');
  }
  if (colIndex.nameAr === -1) {
    errors.push('العمود المطلوب غير موجود: الاسم (Name)');
  }
  if (colIndex.stage === -1) {
    errors.push('العمود المطلوب غير موجود: المرحلة (Stage)');
  }

  if (errors.length > 0) {
    return { candidates: [], errors };
  }

  // Parse data rows
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.some(cell => cell)) continue; // Skip empty rows

    const getCell = (idx: number) => {
      if (idx < 0 || idx >= row.length) return '';
      const val = row[idx];
      return val !== null && val !== undefined ? String(val).trim() : '';
    };
    const warnings: string[] = [];

    const candidateNumber = getCell(colIndex.candidateNumber);
    const nameAr = colIndex.nameAr >= 0 ? getCell(colIndex.nameAr) : '';
    const nameLatin = colIndex.nameLatin >= 0 ? getCell(colIndex.nameLatin) : '';
    const stage = colIndex.stage >= 0 ? getCell(colIndex.stage) : '';

    // Validate required fields — a row missing any of the three is reported
    // and skipped rather than imported half-formed.
    if (!candidateNumber) {
      errors.push(`صف ${i + 1}: الرقم مفقود`);
      continue;
    }
    if (!nameAr) {
      errors.push(`صف ${i + 1}: الاسم مفقود`);
      continue;
    }
    if (!stage) {
      errors.push(`صف ${i + 1}: المرحلة مفقودة`);
      continue;
    }

    const candidate: Omit<Candidate, 'id'> = {
      candidateNumber,
      // The Latin name becomes the primary when the sheet carries one, so a
      // badge can show both scripts; otherwise the Arabic name serves as both.
      name: nameLatin || nameAr,
      nameAr,
      stage,
      group: colIndex.group >= 0 ? getCell(colIndex.group) : undefined,
    };

    // Clean up empty string values
    Object.keys(candidate).forEach(key => {
      if (candidate[key as keyof typeof candidate] === '') {
        delete candidate[key as keyof typeof candidate];
      }
    });

    // A circuit that will not parse is reported rather than silently dropped:
    // a student with no circuit is invisible to their examiner's default list.
    let circuit: number | undefined;
    if (colIndex.circuit >= 0) {
      const raw = getCell(colIndex.circuit);
      if (raw) {
        const parsed = parseInt(raw, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          circuit = parsed;
        } else {
          warnings.push(`الدائرة غير صالحة: ${raw}`);
        }
      }
    }

    candidates.push({ candidate, circuit, warnings });
  }

  return { candidates, errors };
}

/**
 * Parse Excel file (.xlsx, .xls)
 */
export async function parseExcelFile(file: File): Promise<ParseResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  // Get first sheet
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Convert to array of arrays
  const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  return parseRows(rows);
}

/**
 * Parse CSV content to array of rows
 */
function parseCSV(content: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentCell += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentCell += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        currentRow.push(currentCell.trim());
        if (currentRow.some(cell => cell)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
        if (char === '\r') i++;
      } else if (char !== '\r') {
        currentCell += char;
      }
    }
  }

  currentRow.push(currentCell.trim());
  if (currentRow.some(cell => cell)) {
    rows.push(currentRow);
  }

  return rows;
}

/**
 * Parse CSV content to candidates
 */
export function parseCandidatesCSV(content: string): ParseResult {
  const rows = parseCSV(content);
  return parseRows(rows);
}

/**
 * Parse file (auto-detect format: Excel or CSV)
 */
export async function parseCandidatesFromFile(file: File): Promise<ParseResult> {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
    return parseExcelFile(file);
  }

  return parseCandidatesCSV(await decodeTextFile(file));
}
