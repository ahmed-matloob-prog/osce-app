import { v4 as uuidv4 } from 'uuid';
import type { ExamTemplate, Station, ChecklistItem, Candidate } from '../types';
import { SCORING_PRESETS } from '../types';

/**
 * Generate test exam with realistic OSCE stations
 */
export function generateTestExam(): Omit<ExamTemplate, 'id' | 'createdAt' | 'updatedAt'> {
  const stations: Station[] = [
    createHistoryStation(1, 'HX - Chest Pain', 'ألم الصدر', {
      scenario: '62 years male, presented with chest discomfort for 4 hours',
      scenarioAr: 'رجل عمره 62 سنة، يشكو من ألم في الصدر منذ 4 ساعات',
      tasks: ['Take focused history', 'Reach differential diagnosis', 'Order investigations'],
      findings: 'Vitals: BP 160/95 mmHg, HR 110 bpm, RR 24/min, SpO2 92%\nDiaphoretic, anxious, prefers sitting upright\nNo raised JVP, no peripheral edema',
      beforeItems: [
        { text: 'Site (substernal)', category: 'Pain Characteristics' },
        { text: 'Duration (4 hours)', category: 'Pain Characteristics' },
        { text: 'Severity (very severe)', category: 'Pain Characteristics' },
        { text: 'Onset (sudden within 15 min)', category: 'Pain Characteristics' },
        { text: 'Character (pressure/squeezing)', category: 'Pain Characteristics' },
        { text: 'Radiation (left arm, jaw)', category: 'Pain Characteristics' },
        { text: 'Nausea/vomiting', category: 'Associated Symptoms' },
        { text: 'Excessive sweating', category: 'Associated Symptoms' },
        { text: 'Shortness of breath', category: 'Associated Symptoms' },
        { text: 'Previous similar episodes', category: 'Past History' },
        { text: 'Cardiac risk factors (HTN, DM, smoking)', category: 'Risk Factors' },
      ],
      afterItems: [
        { text: 'DDX: Acute coronary syndrome (MI, unstable angina)', category: 'DDX' },
        { text: 'DDX: Pulmonary embolism', category: 'DDX' },
        { text: 'DDX: Aortic dissection', category: 'DDX' },
        { text: 'Investigation: ECG', category: 'Investigations' },
        { text: 'Investigation: Cardiac enzymes (Troponin)', category: 'Investigations' },
        { text: 'Investigation: Chest X-ray', category: 'Investigations' },
      ],
    }),
    createHistoryStation(2, 'HX - Abdominal Pain', 'ألم البطن', {
      scenario: '35 years female, presented with right lower abdominal pain',
      scenarioAr: 'امرأة عمرها 35 سنة، تشكو من ألم في أسفل البطن الأيمن',
      tasks: ['Take focused history', 'Consider gynecological causes', 'Reach differential diagnosis'],
      findings: 'Vitals: BP 120/80 mmHg, HR 90 bpm, Temp 37.8°C\nTenderness RLQ with guarding\nNo rebound tenderness',
      beforeItems: [
        { text: 'Site (right lower quadrant)', category: 'Pain Characteristics' },
        { text: 'Duration and onset', category: 'Pain Characteristics' },
        { text: 'Character (sharp/colicky)', category: 'Pain Characteristics' },
        { text: 'Aggravating factors (movement)', category: 'Pain Characteristics' },
        { text: 'Nausea/vomiting', category: 'Associated Symptoms' },
        { text: 'Fever', category: 'Associated Symptoms' },
        { text: 'Change in bowel habits', category: 'GI Symptoms' },
        { text: 'Last menstrual period', category: 'Gynecological' },
        { text: 'Vaginal discharge/bleeding', category: 'Gynecological' },
        { text: 'Sexual activity and contraception', category: 'Gynecological' },
      ],
      afterItems: [
        { text: 'DDX: Acute appendicitis', category: 'DDX' },
        { text: 'DDX: Ectopic pregnancy', category: 'DDX' },
        { text: 'DDX: Ovarian cyst/torsion', category: 'DDX' },
        { text: 'Investigation: CBC, CRP', category: 'Investigations' },
        { text: 'Investigation: Urine pregnancy test', category: 'Investigations' },
        { text: 'Investigation: Ultrasound abdomen/pelvis', category: 'Investigations' },
      ],
    }),
    createExaminationStation(3, 'Exam - Respiratory', 'فحص الجهاز التنفسي', {
      scenario: '55 years male with chronic cough and shortness of breath',
      scenarioAr: 'رجل عمره 55 سنة يعاني من سعال مزمن وضيق في التنفس',
      tasks: ['Perform focused respiratory examination', 'Describe findings', 'Suggest diagnosis'],
      beforeItems: [
        { text: 'Proper introduction and consent', category: 'General' },
        { text: 'Adequate exposure', category: 'General' },
        { text: 'Inspection: respiratory rate, pattern', category: 'Inspection' },
        { text: 'Inspection: chest shape, symmetry', category: 'Inspection' },
        { text: 'Inspection: use of accessory muscles', category: 'Inspection' },
        { text: 'Palpation: tracheal position', category: 'Palpation' },
        { text: 'Palpation: chest expansion', category: 'Palpation' },
        { text: 'Palpation: tactile fremitus', category: 'Palpation' },
        { text: 'Percussion: technique and interpretation', category: 'Percussion' },
        { text: 'Auscultation: breath sounds', category: 'Auscultation' },
        { text: 'Auscultation: added sounds (crackles, wheeze)', category: 'Auscultation' },
      ],
      afterItems: [
        { text: 'Correct interpretation of findings', category: 'Clinical Reasoning' },
        { text: 'Appropriate differential diagnosis', category: 'Clinical Reasoning' },
      ],
    }),
  ];

  return {
    name: '[TEST] Mid-Term OSCE Exam - 2nd Stage',
    nameAr: '[تجريبي] امتحان أوسكي نصف السنة', 
    description: 'Sample exam with 3 stations for testing',
    stations,
    pinEnabled: false,
    isLocked: false,
  };
}

function createHistoryStation(
  stationNumber: number,
  name: string,
  nameAr: string,
  config: {
    scenario: string;
    scenarioAr: string;
    tasks: string[];
    findings: string;
    beforeItems: { text: string; category: string }[];
    afterItems: { text: string; category: string }[];
  }
): Station {
  return {
    id: uuidv4(),
    stationNumber,
    stationType: 'history',
    name,
    nameAr,
    scenario: config.scenario,
    scenarioAr: config.scenarioAr,
    tasks: config.tasks,
    timeLimit: 600, // 10 minutes
    checklistItems: [
      ...config.beforeItems.map((item) => createChecklistItem(item.text, item.category, 'before_findings')),
      ...config.afterItems.map((item) => createChecklistItem(item.text, item.category, 'after_findings')),
    ],
    examinationFindings: config.findings,
    globalRatingEnabled: true,
  };
}

function createExaminationStation(
  stationNumber: number,
  name: string,
  nameAr: string,
  config: {
    scenario: string;
    scenarioAr: string;
    tasks: string[];
    beforeItems: { text: string; category: string }[];
    afterItems: { text: string; category: string }[];
  }
): Station {
  return {
    id: uuidv4(),
    stationNumber,
    stationType: 'examination',
    name,
    nameAr,
    scenario: config.scenario,
    scenarioAr: config.scenarioAr,
    tasks: config.tasks,
    timeLimit: 600,
    checklistItems: [
      ...config.beforeItems.map((item) => createChecklistItem(item.text, item.category, 'before_findings')),
      ...config.afterItems.map((item) => createChecklistItem(item.text, item.category, 'after_findings')),
    ],
    globalRatingEnabled: true,
  };
}

function createChecklistItem(
  text: string,
  category: string,
  position: 'before_findings' | 'after_findings'
): ChecklistItem {
  return {
    id: uuidv4(),
    text,
    category,
    scoringOptions: SCORING_PRESETS.standard.options.map((o) => ({ ...o })),
    maxScore: SCORING_PRESETS.standard.maxScore,
    position,
  };
}

/**
 * Generate test candidates with Arabic names
/**
 * Sample candidates for trying the app out.
 *
 * The IDs carry a TEST- prefix on purpose. Real college IDs are plain digits,
 * so a prefixed one can never occupy a real student's number. With the unique
 * index on candidateNumber, a fake 2024001 would cause the real 2024001 to be
 * silently skipped on import as a duplicate — and the exam would then run
 * against the wrong person under the right number.
 */
export function generateTestCandidates(): Omit<Candidate, 'id'>[] {
  const candidates: Omit<Candidate, 'id'>[] = [
    { candidateNumber: 'TEST-001', name: 'أحمد محمد حسن', nameAr: 'أحمد محمد حسن', stage: 'المرحلة الثانية', group: 'A' },
    { candidateNumber: 'TEST-002', name: 'سارة علي عبدالله', nameAr: 'سارة علي عبدالله', stage: 'المرحلة الثانية', group: 'A' },
    { candidateNumber: 'TEST-003', name: 'محمد عمر خالد', nameAr: 'محمد عمر خالد', stage: 'المرحلة الثانية', group: 'A' },
    { candidateNumber: 'TEST-004', name: 'فاطمة خالد ابراهيم', nameAr: 'فاطمة خالد ابراهيم', stage: 'المرحلة الثانية', group: 'B' },
    { candidateNumber: 'TEST-005', name: 'يوسف ابراهيم محمود', nameAr: 'يوسف ابراهيم محمود', stage: 'المرحلة الثانية', group: 'B' },
    { candidateNumber: 'TEST-006', name: 'نور الدين أحمد', nameAr: 'نور الدين أحمد', stage: 'المرحلة الثانية', group: 'B' },
    { candidateNumber: 'TEST-007', name: 'ريم عبدالرحمن سعيد', nameAr: 'ريم عبدالرحمن سعيد', stage: 'المرحلة الثانية', group: 'A' },
    { candidateNumber: 'TEST-008', name: 'عمر حسين علي', nameAr: 'عمر حسين علي', stage: 'المرحلة الثانية', group: 'B' },
  ];

  return candidates;
}

import QRCode from 'qrcode';

// Cache for generated QR codes
const qrCodeCache = new Map<string, string>();

/**
 * Generate QR code data URL using qrcode library
 * Returns a cached version if available
 */
export function generateQRCodeDataURL(text: string, size: number = 200): string {
  const cacheKey = `${text}-${size}`;

  // Return cached version if available
  if (qrCodeCache.has(cacheKey)) {
    return qrCodeCache.get(cacheKey)!;
  }

  // Generate synchronously using canvas (will be updated async)
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  // Generate QR code synchronously
  QRCode.toCanvas(canvas, text, {
    width: size,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  }).catch(console.error);

  const dataUrl = canvas.toDataURL('image/png');
  qrCodeCache.set(cacheKey, dataUrl);

  return dataUrl;
}

/**
 * Generate QR code data URL asynchronously (preferred method)
 */
export async function generateQRCodeAsync(text: string, size: number = 200): Promise<string> {
  const cacheKey = `${text}-${size}`;

  if (qrCodeCache.has(cacheKey)) {
    return qrCodeCache.get(cacheKey)!;
  }

  const dataUrl = await QRCode.toDataURL(text, {
    width: size,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });

  qrCodeCache.set(cacheKey, dataUrl);
  return dataUrl;
}
