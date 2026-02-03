# OSCE Exam App - Project Status

**Last Updated:** February 3, 2026

---

## Project Overview

A Progressive Web App (PWA) for OSCE (Objective Structured Clinical Examination) that allows examiners to evaluate examinees at clinical stations. Works offline and syncs when online.

---

## Technology Stack

| Layer | Technology | Status |
|-------|------------|--------|
| Frontend | React 18 + TypeScript + Vite | ✅ Configured |
| Styling | Tailwind CSS | ✅ Configured |
| State | Zustand | ✅ Configured |
| Offline Storage | IndexedDB (Dexie.js) | ✅ Configured |
| PWA | Vite PWA Plugin | ✅ Configured |
| i18n | react-i18next | ✅ Configured |
| QR Scanner | html5-qrcode | ✅ Integrated |
| Backend/Sync | Firebase | ✅ Configured (needs credentials) |
| Reports | jsPDF + XLSX | ✅ Implemented |

---

## Completed Features

### Phase 1: Foundation ✅
- [x] React + Vite + TypeScript project initialized
- [x] Tailwind CSS with responsive breakpoints
- [x] PWA configuration (manifest, service worker)
- [x] IndexedDB with Dexie.js schema
- [x] Basic routing structure
- [x] i18n for Arabic/English

### Phase 2: Exam & Station Management ✅
- [x] Exam template CRUD (create, list, delete)
- [x] Station builder with variable scoring options
- [x] Station types: History, Examination, Procedure, Communication
- [x] Circuit management (create circuits per exam)
- [x] Checklist items with position (before/after findings)
- [x] Examination findings section (for History stations)

### Phase 3: Active Examination ✅
- [x] Exam session setup (select exam, circuit, station, examiner name)
- [x] Evaluation screen with competency scoring
- [x] 6 scoring presets: Standard (2/1/0), Weighted (3/1/0), Binary (1/0), Binary-2 (2/0), Detailed (4/3/2/1/0), Flexible (3/2/1/0)
- [x] Custom scoring editor (add/remove/edit score values)
- [x] Station timer with color warnings
- [x] Real-time score calculation
- [x] Global rating component (0-4 scale)
- [x] Candidate selector with search
- [x] QR scanner for candidate badges
- [x] Notes and submission flow

---

## Pending Features

### Phase 4: Firebase Integration
- [x] Firebase project setup
- [x] Firestore data sync
- [x] Offline queue and conflict resolution
- [x] Sync status indicators
- [ ] Configure real Firebase credentials in Vercel

### Phase 5: Reports & Polish
- [x] PDF report generation (with circuit & examiner columns)
- [x] Export functionality (Excel with XLSX)
- [x] Import candidates from CSV
- [x] Import stations from Word/Text documents
- [ ] Analytics dashboard (per circuit, per station)
- [ ] UI polish and accessibility
- [ ] Tablet responsiveness testing

### Phase 6: Security & Validation (NEW)
- [ ] PIN-Based Admin System
- [ ] QR Code Validation System
- [ ] Circuit Check-In Screen

---

## File Structure

```
osce-app/
├── src/
│   ├── components/
│   │   ├── scanner/
│   │   │   └── QRScanner.tsx        # QR/barcode scanner component
│   │   ├── import/
│   │   │   ├── CandidateImportModal.tsx  # CSV candidate import
│   │   │   └── StationImportModal.tsx    # Word/Text station import
│   │   └── ui/
│   │       └── Layout.tsx           # App layout with navigation
│   ├── db/
│   │   ├── schema.ts                # IndexedDB schema (Dexie)
│   │   └── sync.ts                  # Firebase sync logic
│   ├── hooks/
│   │   └── (empty - hooks to be added)
│   ├── i18n/
│   │   ├── index.ts                 # i18n configuration
│   │   ├── en.ts                    # English translations
│   │   └── ar.ts                    # Arabic translations
│   ├── pages/
│   │   ├── Dashboard.tsx            # Home page with quick actions
│   │   ├── Exams.tsx                # List of exams
│   │   ├── ExamBuilder.tsx          # Create/edit exam templates
│   │   ├── Candidates.tsx           # Manage candidates
│   │   ├── Reports.tsx              # View reports (placeholder)
│   │   ├── Settings.tsx             # App settings
│   │   ├── SessionSetup.tsx         # Start exam session
│   │   └── ActiveExam.tsx           # Main scoring interface
│   ├── services/
│   │   ├── firebase.ts            # Firebase configuration
│   │   ├── pdfGenerator.ts        # PDF report generation
│   │   ├── excelExporter.ts       # Excel export with XLSX
│   │   ├── csvParser.ts           # CSV candidate import
│   │   ├── textParser.ts          # Text station import
│   │   ├── wordParser.ts          # Word document parser
│   │   ├── candidateParser.ts     # Candidate data parsing
│   │   └── testDataGenerator.ts   # Generate test data
│   ├── stores/
│   │   ├── examStore.ts             # Exam state management
│   │   ├── candidateStore.ts        # Candidate state management
│   │   └── syncStore.ts             # Sync status management
│   ├── types/
│   │   └── index.ts                 # TypeScript type definitions
│   ├── App.tsx                      # Root component with routing
│   ├── main.tsx                     # Entry point
│   └── index.css                    # Global styles + Tailwind
├── public/
│   └── (PWA assets)
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

---

## Key Data Models

### ChecklistItem (with customizable scoring)
```typescript
interface ChecklistItem {
  id: string;
  text: string;
  textAr?: string;
  category?: string;
  scoringOptions: ScoringOption[];  // Fully customizable
  maxScore: number;
  position: 'before_findings' | 'after_findings';
}
```

### Station (with type)
```typescript
interface Station {
  id: string;
  stationNumber: number;
  stationType: 'history' | 'examination' | 'procedure' | 'communication';
  name: string;
  scenario: string;
  tasks: string[];
  timeLimit: number;
  checklistItems: ChecklistItem[];
  examinationFindings?: string;  // Only for 'history' type
  globalRatingEnabled: boolean;
}
```

### Scoring Presets
```typescript
SCORING_PRESETS = {
  'standard':    { label: 'Standard (2/1/0)',      options: [2,1,0] },
  'weighted-3':  { label: 'Weighted (3/1/0)',      options: [3,1,0] },
  'binary':      { label: 'Binary (1/0)',          options: [1,0] },
  'binary-2':    { label: 'Binary (2/0)',          options: [2,0] },
  'detailed-4':  { label: 'Detailed (4/3/2/1/0)',  options: [4,3,2,1,0] },
  'flexible-3':  { label: 'Flexible (3/2/1/0)',    options: [3,2,1,0] },
}
```

---

## How to Run

```bash
cd osce-app

# Install dependencies
npm install

# Development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

---

## App Workflow

### For Examiner:
1. **Dashboard** → Click "Start Session"
2. **Session Setup** → Select exam, circuit, station, enter examiner name
3. **Active Exam** →
   - Select candidate (scan QR or search)
   - Score checklist items
   - Add global rating
   - Submit evaluation
   - Repeat for next candidate

### For Admin:
1. **Exams** → Create new exam with stations
2. **Candidates** → Import/add candidates
3. **Reports** → View evaluations (pending)

---

## QR Scanner Location

The QR scanner is accessed from **Active Exam Screen** → **Candidate Selector Modal** → **"Scan QR Badge" button**

File: `src/components/scanner/QRScanner.tsx`
Integration: `src/pages/ActiveExam.tsx` (lines 199-251)

---

## Next Steps

1. **Firebase Integration** - Set up Firestore for cloud sync (needs real credentials)
2. **PIN-Based Admin System** - Protect admin functions with PIN
3. **QR Code Validation** - Validate badges against current exam
4. **Analytics Dashboard** - Pass rates, averages per station

---

## Future Features

### Feature 1: PIN-Based Admin System

#### Overview
Implement a role-based PIN system to control access to admin functions without requiring user accounts. This provides security while maintaining simplicity.

#### PIN Configuration

**Admin PIN is OPTIONAL** - User chooses whether to enable PIN protection when creating an exam.

| Role | PIN Required | Permissions |
|------|-------------|-------------|
| **Admin** | Optional (4-6 digits) | Edit exam, add/edit stations, add/edit candidates, lock/unlock exam, delete exam, view reports, export data |
| **Reports** | Optional, separate PIN | View reports (read-only), export data |
| **Examiner** | No PIN | View exam, select station, evaluate candidates, submit evaluations |

**Without PIN:** Exam works like current behavior (always editable, no lock)
**With PIN:** Exam can be locked, admin actions require PIN

#### Exam States

```
┌─────────────┐     Admin PIN      ┌─────────────┐
│   DRAFT     │ ──────────────────>│   LOCKED    │
│  (Editable) │                    │ (Exam Mode) │
└─────────────┘                    └─────────────┘
      ^                                   │
      │           Admin PIN               │
      └───────────────────────────────────┘
```

- **DRAFT State**: Exam can be edited, stations/candidates can be modified
- **LOCKED State**: Exam template frozen, only evaluations can be added

#### PIN Recovery: Backup Codes
When creating an exam, generate 5 one-time backup codes:
- Each code can only be used ONCE to reset Admin PIN
- Codes are hashed before storage
- Fallback: Edit PIN directly in Firebase Console

#### UI Components

**Creating Exam (PIN disabled - default):**
```
┌─────────────────────────────────────────────┐
│  Create New Exam                            │
├─────────────────────────────────────────────┤
│  Exam Name: [Mid-Year OSCE 2026        ]   │
│  Description: [2nd Stage Clinical Exam ]   │
│                                             │
│  ─── Security Settings ───                  │
│                                             │
│  ☐ Enable Admin PIN (protect this exam)    │
│                                             │
│              [Create Exam]                  │
└─────────────────────────────────────────────┘
```

**Creating Exam (PIN enabled):**
```
┌─────────────────────────────────────────────┐
│  Create New Exam                            │
├─────────────────────────────────────────────┤
│  Exam Name: [Mid-Year OSCE 2026        ]   │
│  Description: [2nd Stage Clinical Exam ]   │
│                                             │
│  ─── Security Settings ───                  │
│                                             │
│  ☑ Enable Admin PIN (protect this exam)    │
│                                             │
│  Admin PIN:    [••••]  (4-6 digits)        │
│  Confirm PIN:  [••••]                       │
│                                             │
│  ☐ Enable Reports PIN (optional)            │
│  Reports PIN:  [    ]                       │
│                                             │
│              [Create Exam]                  │
└─────────────────────────────────────────────┘
```

**PIN Entry Modal:**
```
┌─────────────────────────────────────────────┐
│  Enter Admin PIN                            │
├─────────────────────────────────────────────┤
│         ┌───┬───┬───┬───┬───┬───┐          │
│         │ • │ • │ • │ • │   │   │          │
│         └───┴───┴───┴───┴───┴───┘          │
│                                             │
│         [1] [2] [3]                         │
│         [4] [5] [6]                         │
│         [7] [8] [9]                         │
│         [←] [0] [✓]                         │
│                                             │
│         [Forgot PIN?]                       │
└─────────────────────────────────────────────┘
```

#### Data Model Changes

```typescript
interface ExamTemplate {
  // ... existing fields ...

  // NEW: Security fields (all optional)
  pinEnabled: boolean;        // Is PIN protection enabled?
  adminPin?: string;          // Hashed PIN (4-6 digits) - only if pinEnabled
  reportsPin?: string;        // Optional hashed PIN for reports access
  backupCodes?: BackupCode[]; // 5 one-time recovery codes - only if pinEnabled
  isLocked: boolean;          // Exam state (draft/locked) - only matters if pinEnabled
  lockedAt?: Date;            // When exam was locked
  lockedBy?: string;          // Device ID that locked
}

interface BackupCode {
  code: string;     // Hashed code (e.g., "ABCD-1234")
  used: boolean;    // Has it been used?
  usedAt?: Date;    // When was it used?
}
```

#### Implementation Steps

1. **Update Schema** - Add PIN fields to ExamTemplate in `src/db/schema.ts`
2. **Create PIN Utilities** - `src/utils/pinUtils.ts` (hashPin, verifyPin, generateBackupCodes)
3. **Create PIN Modal** - `src/components/PinModal.tsx` (numeric keypad UI)
4. **Create Backup Codes Modal** - `src/components/BackupCodesModal.tsx`
5. **Update Exam Creation** - Modify `src/pages/ExamBuilder.tsx` (add PIN input)
6. **Add Lock/Unlock** - Update `src/pages/Dashboard.tsx` (lock/unlock buttons)
7. **Protect Admin Actions** - Wrap edit/delete with PIN verification
8. **Implement PIN Recovery** - Backup code verification flow
9. **Update Sync** - Modify `src/db/sync.ts` (sync hashed PIN data)
10. **Testing** - All flows including offline

#### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/db/schema.ts` | Modify | Add PIN fields to ExamTemplate |
| `src/utils/pinUtils.ts` | Create | PIN hashing and verification |
| `src/components/PinModal.tsx` | Create | PIN entry dialog |
| `src/components/BackupCodesModal.tsx` | Create | Show backup codes |
| `src/pages/ExamBuilder.tsx` | Modify | Add PIN setup |
| `src/pages/Dashboard.tsx` | Modify | Add lock/unlock buttons |
| `src/db/sync.ts` | Modify | Sync PIN data |

---

### Feature 2: QR Code Validation System

#### Overview
Improve the QR code system to include exam validation, preventing badges from wrong exams being scanned.

#### Current System Issues

| Issue | Problem |
|-------|---------|
| Simple encoding | QR contains only candidate number |
| No validation | Can't verify QR is for correct exam |
| Fuzzy matching | Could match wrong candidate |
| No audit trail | No logging of scans |

#### New QR Code Format

**Current:** `2024001` (just candidate number)

**New:** `OSCE:exam123:2024001` (PREFIX:EXAM_ID:CANDIDATE_NUMBER)

#### Validation Flow

```
QR Scanned: "OSCE:exam123:2024001"
                    │
                    ▼
Step 1: Parse QR
  prefix = "OSCE"
  examId = "exam123"
  candidateNumber = "2024001"
                    │
                    ▼
Step 2: Validate Exam
  Current exam: "exam123" ✅ Match!
  (or ❌ "This QR is for a different exam!")
                    │
                    ▼
Step 3: Lookup Candidate
  Find candidate with number "2024001"
  ✅ Found: Ahmed Mohammad Hassan
```

#### User Experience

**Valid QR (correct exam):**
```
✅ Candidate found: Ahmed Mohammad Hassan
   Number: 2024001 | Group: A
```

**Wrong Exam:**
```
❌ Invalid QR Code

This badge is for:
  "Final OSCE 2025"

Current exam is:
  "Mid-Year OSCE 2026"

[Dismiss]
```

**Legacy QR (old format):**
```
⚠️ Old Badge Format

Candidate found: Ahmed Mohammad Hassan
But badge doesn't include exam verification.

Consider reprinting badges for security.

[Continue Anyway]  [Cancel]
```

#### Updated Badge Design

```
┌─────────────────────────────────────┐
│                                     │
│         ┌─────────────┐             │
│         │  [QR CODE]  │             │
│         └─────────────┘             │
│                                     │
│          2024001                    │  ← Candidate number
│       أحمد محمد حسن                 │  ← Arabic name
│       Ahmed M. Hassan               │  ← English name
│                                     │
│  ─────────────────────────────────  │
│  Mid-Year OSCE 2026                 │  ← Exam name
│  Group: A                           │  ← Group (if assigned)
└─────────────────────────────────────┘
```

#### QR Utility Functions

```typescript
// src/utils/qrUtils.ts

interface QRCodeData {
  prefix: 'OSCE';
  examId: string;
  candidateNumber: string;
}

// Encode QR data
function encodeQR(examId: string, candidateNumber: string): string {
  return `OSCE:${examId}:${candidateNumber}`;
}

// Decode QR data (with legacy support)
function decodeQR(qrText: string): QRCodeData | null {
  // New format: OSCE:examId:candidateNumber
  if (qrText.startsWith('OSCE:')) {
    const parts = qrText.split(':');
    if (parts.length >= 3) {
      return {
        prefix: 'OSCE',
        examId: parts[1],
        candidateNumber: parts[2]
      };
    }
  }

  // Legacy format: just candidate number
  if (/^\d+$/.test(qrText)) {
    return {
      prefix: 'OSCE',
      examId: 'unknown',
      candidateNumber: qrText
    };
  }

  return null;
}

// Validate scanned QR against current exam
function validateQR(qrText: string, currentExamId: string): ValidationResult {
  // ... validation logic
}
```

#### Implementation Steps

1. **Create QR Utilities** - `src/utils/qrUtils.ts` (encodeQR, decodeQR, validateQR)
2. **Update Badge Generation** - Modify `src/pages/Settings.tsx` (use new QR format)
3. **Update Scanner Integration** - Modify `src/pages/ActiveExam.tsx` (add validation)
4. **Handle Legacy QR Codes** - Support old format with warning
5. **Fix Fuzzy Matching** - Change to exact match first, fuzzy as fallback

#### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/utils/qrUtils.ts` | Create | QR encode/decode/validate |
| `src/pages/Settings.tsx` | Modify | Update badge generation |
| `src/pages/ActiveExam.tsx` | Modify | Add scan validation |
| `src/components/scanner/QRScanner.tsx` | Modify | Pass validation results |

#### Backward Compatibility
- Old QR codes (just candidate number) still work
- Warning shown when scanning old format
- New badges include exam ID for validation
- No breaking changes to existing data

---

### Feature 3: Circuit Check-In (Future Enhancement)

Optional feature for exam day morning:

```
┌─────────────────────────────────────────────────────────────┐
│  CHECK-IN SCREEN (Exam Day Morning)                         │
├─────────────────────────────────────────────────────────────┤
│  Scan candidate badge to assign circuit                     │
│                                                             │
│  Candidate: Ahmed Mohammad Hassan                           │
│  Number: 2024001                                            │
│                                                             │
│  Assign to Circuit: [Circuit 1 ▼]                           │
│                                                             │
│  [Confirm Check-In]                                         │
└─────────────────────────────────────────────────────────────┘
```

This would store circuit assignment in candidate record and enable circuit validation during evaluation.

---

## Notes

- The app is designed to work offline-first using IndexedDB
- All data persists locally even without internet
- QR scanner requires camera permission and works on devices with cameras
- Station types determine which sections are shown (e.g., Examination Findings only for History type)
- Scoring is fully customizable per checklist item
