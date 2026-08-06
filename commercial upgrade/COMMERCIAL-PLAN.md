# OSCE App - Commercial Upgrade Plan
> Date: February 2026
> Status: Planning Phase

---

## Current State (MVP)

### Existing Features
- Exam builder with stations/checklists
- QR candidate scanning
- Timer system
- Offline-first PWA (IndexedDB + Dexie.js)
- Firebase Firestore sync
- Bilingual (English/Arabic)
- PIN-based admin security with backup codes
- Student check-in per circuit
- Basic reports (PDF/Excel export)
- CSV candidate import
- Circuit-based OSCE management

### Tech Stack
| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS |
| State | Zustand |
| Local DB | IndexedDB (Dexie.js) |
| Cloud DB | Firebase Firestore |
| Routing | React Router |
| i18n | react-i18next |
| PWA | vite-plugin-pwa |
| Hosting | Vercel |
| Repo | GitHub |

---

## Gap Analysis: Current vs Commercial (ExamSoft-level)

### 1. Authentication & Multi-Tenancy (CRITICAL - Phase 1)
**Current:** No auth - anyone with URL can access everything, PIN-only protection
**Needed:**
- User accounts (email/password, SSO with Google/Microsoft)
- Role-based access control (RBAC):
  - Super Admin (platform owner)
  - Institution Admin (university/hospital admin)
  - Examiner (scores students)
  - Observer (view-only)
  - Student (limited access)
- Multi-tenant architecture (each university/hospital isolated)
- Team management (invite examiners, assign permissions)
- Session management (token refresh, forced logout)

### 2. Cloud Infrastructure (CRITICAL - Phase 1)
**Current:** Client-only with basic Firebase
**Needed:**
- Backend API (Node.js/Express or Next.js API routes)
- Firestore rules for multi-tenancy OR migrate to PostgreSQL (Supabase)
- File storage for station images, documents, exports (Firebase Storage / S3)
- Real-time sync via Firestore listeners for live exam monitoring

### 3. Security & Compliance (CRITICAL - Phase 1)
**Current:** PIN-only, no audit trail
**Needed:**
- HIPAA compliance (if used in US clinical settings)
- FERPA compliance (US student data protection)
- GDPR (if used in EU)
- Data encryption at rest and in transit
- Audit trail (log every action: who did what, when)
- Penetration testing

### 4. Admin Dashboard (HIGH PRIORITY - Phase 2)
**Current:** Basic stats only
**Needed:**
- Real-time exam monitoring (see all circuits live)
- Student progress tracking (who completed what station)
- Examiner activity monitoring (are all examiners scoring?)
- Alert system (missing scores, time overruns, disconnected devices)
- Institution settings (branding, defaults, exam policies)

### 5. Advanced Reporting & Analytics (HIGH PRIORITY - Phase 2)
**Current:** Basic score display
**Needed:**
- Psychometric analysis (item difficulty, discrimination index)
- Reliability metrics (Cronbach's alpha, inter-rater reliability)
- Borderline regression / standard setting methods (Angoff, BRM)
- Visual dashboards (charts, heatmaps, station comparisons)
- Export formats (PDF, Excel, CSV, LMS integration)
- Comparative reports (across cohorts, years, institutions)

### 6. Payment & Licensing (HIGH PRIORITY - Phase 3)
**Current:** None
**Needed:**
- Subscription tiers (Free, Pro, Enterprise)
- Stripe integration (recurring billing)
- Usage-based pricing (per student, per exam, per institution)
- Trial system (14-day free trial)
- License management (activate/deactivate institutions)

### 7. Exam Management Enhancements (MEDIUM - Phase 2)
**Current:** Basic exam builder
**Needed:**
- Blueprinting (map stations to competencies/learning objectives)
- Station library (reusable templates across exams)
- Question bank (versioned, tagged, searchable)
- Exam scheduling (calendar with circuit/room/examiner assignment)
- Standardized patient (SP) management
- Multiple scoring methods (global rating, checklist, rubric, Likert)
- Video recording (record stations for review/appeals)
- Digital signatures (examiner sign-off)

### 8. Communication & Notifications (MEDIUM - Phase 3)
**Current:** None
**Needed:**
- Email notifications (exam invites, results, reminders)
- Push notifications (real-time alerts on mobile)
- SMS alerts (critical notifications)
- In-app messaging (announcements to examiners)

### 9. Integration & API (MEDIUM - Phase 4)
**Current:** None
**Needed:**
- REST API for third-party integrations
- LMS integration (Moodle, Blackboard, Canvas)
- SIS integration (Student Information Systems)
- Webhook support (event-driven integrations)
- SCORM/xAPI (learning standards compliance)

### 10. DevOps & Scalability (MEDIUM - Phase 4)
**Current:** Manual Vercel deploy
**Needed:**
- CI/CD pipeline (automated testing & deployment)
- Load testing (handle 1000+ concurrent users)
- CDN (global content delivery)
- Database backups (automated, point-in-time recovery)
- Monitoring (Sentry error tracking, uptime monitoring)
- Staging environment (test before production)

### 11. User Experience (LOWER - Phase 5)
**Current:** Functional UI
**Needed:**
- Onboarding wizard (first-time setup guide)
- Help center (documentation, FAQs, video tutorials)
- In-app support (chat widget, ticket system)
- Accessibility (WCAG 2.1 compliance)
- More languages (French, Spanish, Turkish, etc.)
- White-labeling (custom branding per institution)

---

## Phased Roadmap

| Phase | Focus | Timeline | Status |
|-------|-------|----------|--------|
| **Phase 1** | Auth + Multi-tenancy + Admin Dashboard | 2-3 months | NOT STARTED |
| **Phase 2** | Advanced Reports + Exam Enhancements | 2-3 months | NOT STARTED |
| **Phase 3** | Payment + Licensing + Landing Page | 1-2 months | NOT STARTED |
| **Phase 4** | Integrations + API + Compliance | 2-3 months | NOT STARTED |
| **Phase 5** | Scale + Polish + Launch | 1-2 months | NOT STARTED |

---

## Cost Estimates

### Option A: Solo Developer + AI (Recommended)

**Development:** $0 labor (your time + Claude Code)

**Monthly Infrastructure:**
| Service | Purpose | Cost/mo |
|---------|---------|---------|
| Claude Code (Max) | AI dev assistant | $100-200 |
| Firebase (Blaze) | Auth + Firestore + Storage | $25-100 |
| Vercel Pro | Hosting + Edge | $20 |
| Stripe | Payments (2.9% + $0.30/txn) | Pay-per-use |
| Resend/SendGrid | Emails | $0-20 |
| Sentry | Error monitoring | $0 (free tier) |
| Domain + SSL | Professional branding | $15/year |
| **Monthly Total** | | **~$65-340/mo** |

**Year 1 Total: ~$4,000-5,000**

### Option B: Hire Small Team
| Role | Monthly Salary | Duration |
|------|---------------|----------|
| Full-stack Developer | $3,000-6,000 | 8-12 months |
| UI/UX Designer | $2,000-4,000 | 3-4 months |
| QA Tester | $1,500-3,000 | 4-6 months |
| DevOps (part-time) | $1,000-2,000 | 3-4 months |
| **Total** | | **$36,000-96,000** |

### Option C: Outsource to Agency
| Tier | Cost | Quality |
|------|------|---------|
| Low-cost (India/Pakistan) | $15,000-30,000 | Variable |
| Mid-range (Eastern Europe) | $40,000-80,000 | Good |
| Premium (US/UK) | $100,000-250,000 | High |

---

## Revenue Projections

### Pricing Models
| Model | Price | Notes |
|-------|-------|-------|
| Per institution/year | $2,000-5,000 | Annual subscription |
| Per student/exam | $5-15 | Usage-based (ExamSoft charges ~$15-25) |
| Per examiner seat/mo | $20-50 | Seat-based |

### Revenue by Client Count
| Clients | Per Institution | Per Student/Exam | Hybrid |
|---------|----------------|-----------------|--------|
| 10 institutions | $20K-50K/yr | Variable | $30K-60K/yr |
| 50 institutions | $100K-250K/yr | Variable | $150K-300K/yr |
| 200 institutions | $400K-1M/yr | Variable | $600K-1.2M/yr |

### Operational Costs at Scale
| Category | 10 Clients | 50 Clients | 200 Clients |
|----------|-----------|-----------|-------------|
| Firebase/DB | $50/mo | $200/mo | $800/mo |
| Hosting | $20/mo | $50/mo | $200/mo |
| Email service | $20/mo | $50/mo | $100/mo |
| Monitoring | $0/mo | $30/mo | $80/mo |
| Support staff | $0 (you) | $500/mo | $2,000/mo |
| **Monthly Total** | **~$90** | **~$830** | **~$3,180** |

### Break-Even
With Option A (solo + AI): **2-3 institutional clients** at $2,000/year covers all costs.

---

## Recommended Tech Stack for Commercial

| Layer | Current | Commercial Upgrade |
|-------|---------|-------------------|
| Frontend | React + Vite PWA | Same (good choice) |
| Backend | None (client-only) | **Next.js API routes** or **Express** |
| Database | IndexedDB + Firestore | **PostgreSQL (Supabase)** + IndexedDB offline |
| Auth | PIN only | **Supabase Auth** or **Firebase Auth** + RBAC |
| Payments | None | **Stripe** |
| Hosting | Vercel | Vercel (frontend) + **Railway/Fly.io** (backend) |
| Monitoring | None | **Sentry** + **Vercel Analytics** |
| Email | None | **Resend** or **SendGrid** |

---

## Competitive Advantage
- **Lower price point** than ExamSoft ($2K vs $10K+/institution)
- **Bilingual (EN/AR)** - underserved Middle East market
- **Offline-first PWA** - works in low-connectivity environments
- **No app store dependency** - instant access via browser
- **Circuit-based workflow** - purpose-built for OSCE (not adapted from MCQ tools)
- **QR-based check-in** - modern, fast student identification

---

## Notes
- ExamSoft raised millions in VC funding; we can build incrementally for under $5K/year
- Middle East medical schools are an underserved market for OSCE digital tools
- Many schools still use paper checklists - huge opportunity
- Start with 1-2 pilot institutions before full commercial launch
