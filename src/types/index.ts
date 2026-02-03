// OSCE Exam App - Type Definitions

// Scoring option for checklist items
export interface ScoringOption {
  value: number;
  label: string;
  labelAr?: string;
}

// Checklist item with variable scoring
export interface ChecklistItem {
  id: string;
  text: string;
  textAr?: string;
  category?: string;
  scoringOptions: ScoringOption[]; // Fully customizable scoring options
  maxScore: number;
  position: 'before_findings' | 'after_findings'; // Before or after examination findings
}

// Station type
export type StationType = 'history' | 'examination' | 'procedure' | 'communication';

// Station definition
export interface Station {
  id: string;
  stationNumber: number;
  stationType: StationType; // Type of station
  name: string;
  nameAr?: string;
  scenario: string;
  scenarioAr?: string;
  tasks: string[];
  tasksAr?: string[];
  timeLimit: number; // in seconds
  checklistItems: ChecklistItem[];
  examinationFindings?: string; // Only used for 'history' type stations
  examinationFindingsAr?: string;
  globalRatingEnabled: boolean;
}

// Backup code for PIN recovery
export interface BackupCode {
  code: string;     // Hashed code (e.g., "ABCD-1234")
  used: boolean;    // Has it been used?
  usedAt?: Date;    // When was it used?
}

// Exam template
export interface ExamTemplate {
  id: string;
  name: string;
  nameAr?: string;
  description: string;
  descriptionAr?: string;
  stations: Station[];
  createdAt: Date;
  updatedAt: Date;

  // Security fields (PIN system)
  pinEnabled: boolean;        // Is PIN protection enabled?
  adminPin?: string;          // Hashed PIN (4-6 digits) - only if pinEnabled
  reportsPin?: string;        // Optional hashed PIN for reports access
  backupCodes?: BackupCode[]; // 5 one-time recovery codes - only if pinEnabled
  isLocked: boolean;          // Exam state (draft/locked) - only matters if pinEnabled
  lockedAt?: Date;            // When exam was locked
  lockedBy?: string;          // Device ID that locked
}

// Candidate
export interface Candidate {
  id: string;
  name: string;
  nameAr?: string;
  candidateNumber: string;
  email?: string;
  group?: string;
  stage?: string;
  semester?: string;
}

// Circuit examiner assignment
export interface CircuitExaminer {
  stationId: string;
  examinerName: string;
  examinerNameAr?: string;
}

// Circuit (group of candidates running simultaneously)
export interface Circuit {
  id: string;
  examId: string;
  circuitNumber: number;
  name?: string;
  nameAr?: string;
  examiners: CircuitExaminer[];
  candidateIds: string[];
}

// Individual score in an evaluation
export interface ItemScore {
  itemId: string;
  score: number;
}

// Evaluation result
export interface Evaluation {
  id: string;
  examId: string;
  circuitId: string;
  candidateId: string;
  stationId: string;
  examinerName: string;
  scores: ItemScore[];
  globalRating?: number; // 0-4
  notes: string;
  startTime: Date;
  endTime?: Date;
  totalScore: number;
  maxPossibleScore: number;
  synced: boolean;
  syncedAt?: Date;
}

// Global rating labels
export const GLOBAL_RATING_LABELS = {
  0: 'Clear fail',
  1: 'Borderline',
  2: 'Pass',
  3: 'Good pass',
  4: 'Excellent',
} as const;

export const GLOBAL_RATING_LABELS_AR = {
  0: 'رسوب واضح',
  1: 'حدّي',
  2: 'ناجح',
  3: 'ناجح جيد',
  4: 'ممتاز',
} as const;

// Scoring Presets - Common patterns found in OSCE stations
export const SCORING_PRESETS = {
  // Standard 3-level: [2] [1] [0]
  'standard': {
    label: 'Standard (2/1/0)',
    options: [
      { value: 2, label: 'Competent', labelAr: 'كفء' },
      { value: 1, label: 'Borderline', labelAr: 'حدّي' },
      { value: 0, label: 'Incompetent', labelAr: 'غير كفء' },
    ],
    maxScore: 2,
  },
  // Higher weight 3-level: [3] [1] [0]
  'weighted-3': {
    label: 'Weighted (3/1/0)',
    options: [
      { value: 3, label: 'Competent', labelAr: 'كفء' },
      { value: 1, label: 'Borderline', labelAr: 'حدّي' },
      { value: 0, label: 'Incompetent', labelAr: 'غير كفء' },
    ],
    maxScore: 3,
  },
  // Binary pass/fail: [1] [0]
  'binary': {
    label: 'Binary (1/0)',
    options: [
      { value: 1, label: 'Done', labelAr: 'تم' },
      { value: 0, label: 'Not done', labelAr: 'لم يتم' },
    ],
    maxScore: 1,
  },
  // Binary with higher weight: [2] [0]
  'binary-2': {
    label: 'Binary (2/0)',
    options: [
      { value: 2, label: 'Done', labelAr: 'تم' },
      { value: 0, label: 'Not done', labelAr: 'لم يتم' },
    ],
    maxScore: 2,
  },
  // 4-level scale: [4] [3] [2] [1] [0]
  'detailed-4': {
    label: 'Detailed (4/3/2/1/0)',
    options: [
      { value: 4, label: 'Excellent', labelAr: 'ممتاز' },
      { value: 3, label: 'Good', labelAr: 'جيد' },
      { value: 2, label: 'Adequate', labelAr: 'مقبول' },
      { value: 1, label: 'Poor', labelAr: 'ضعيف' },
      { value: 0, label: 'Not done', labelAr: 'لم يتم' },
    ],
    maxScore: 4,
  },
  // Flexible borderline: [3] [2] [1] [0]
  'flexible-3': {
    label: 'Flexible (3/2/1/0)',
    options: [
      { value: 3, label: 'Competent', labelAr: 'كفء' },
      { value: 2, label: 'Borderline+', labelAr: 'حدّي+' },
      { value: 1, label: 'Borderline-', labelAr: 'حدّي-' },
      { value: 0, label: 'Incompetent', labelAr: 'غير كفء' },
    ],
    maxScore: 3,
  },
} as const;

export type ScoringPresetKey = keyof typeof SCORING_PRESETS;

// Legacy exports for backward compatibility
export const THREE_LEVEL_SCORING: ScoringOption[] = [
  { value: 2, label: 'Competent', labelAr: 'كفء' },
  { value: 1, label: 'Borderline', labelAr: 'حدّي' },
  { value: 0, label: 'Incompetent', labelAr: 'غير كفء' },
];
export const TWO_LEVEL_SCORING: ScoringOption[] = [
  { value: 1, label: 'Pass', labelAr: 'ناجح' },
  { value: 0, label: 'Fail', labelAr: 'راسب' },
];

// Exam session (active examination state)
export interface ExamSession {
  id: string;
  examId: string;
  circuitId: string;
  stationId: string;
  examinerName: string;
  startedAt: Date;
  isActive: boolean;
}

// App settings
export interface AppSettings {
  language: 'en' | 'ar';
  autoSync: boolean;
  soundAlerts: boolean;
  timerWarningSeconds: number;
}

// Sync status
export interface SyncStatus {
  isOnline: boolean;
  lastSyncAt?: Date;
  pendingCount: number;
  isSyncing: boolean;
}
