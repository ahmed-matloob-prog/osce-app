import * as XLSX from 'xlsx';
import type { Candidate } from '../types';

interface ParsedCandidate {
  candidate: Omit<Candidate, 'id'>;
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

  // Find column indices from headers
  const colIndex = {
    candidateNumber: findCol(['candidatenumber', 'candidate_number', 'number', 'id', 'رقم', 'الرقم']),
    nameAr: findCol(['namear', 'name_ar', 'arabicname', 'arabic_name', 'الاسم', 'name', 'اسم']),
    stage: findCol(['stage', 'المرحلة']),
    group: findCol(['group', 'المجموعة', 'فوج']),
    email: findCol(['email', 'mail', 'البريد']),
  };

  // Validate required columns
  if (colIndex.candidateNumber === -1) {
    errors.push('العمود المطلوب غير موجود: رقم الطالب (CandidateNumber)');
  }
  if (colIndex.nameAr === -1) {
    errors.push('العمود المطلوب غير موجود: الاسم (NameAr)');
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
    const nameAr = getCell(colIndex.nameAr);

    // Validate required fields
    if (!candidateNumber) {
      errors.push(`صف ${i + 1}: رقم الطالب مفقود`);
      continue;
    }
    if (!nameAr) {
      errors.push(`صف ${i + 1}: الاسم مفقود`);
      continue;
    }

    const candidate: Omit<Candidate, 'id'> = {
      candidateNumber,
      name: nameAr, // Use Arabic name as primary name
      nameAr,
      email: colIndex.email >= 0 ? getCell(colIndex.email) : undefined,
      group: colIndex.group >= 0 ? getCell(colIndex.group) : undefined,
      stage: colIndex.stage >= 0 ? getCell(colIndex.stage) : undefined,
    };

    // Clean up empty string values
    Object.keys(candidate).forEach(key => {
      if (candidate[key as keyof typeof candidate] === '') {
        delete candidate[key as keyof typeof candidate];
      }
    });

    candidates.push({ candidate, warnings });
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
  } else {
    // CSV - read as UTF-8
    const content = await file.text();
    return parseCandidatesCSV(content);
  }
}
