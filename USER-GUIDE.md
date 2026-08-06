# OSCE Exam App — User Guide

A simple guide for running an OSCE (Objective Structured Clinical Examination) with this app.

The app works on phones, tablets, and computers through a web browser. It works **offline** — all your work is saved on the device and uploaded to the cloud automatically when you're back online.

---

## Contents

1. [Quick Start](#quick-start)
2. [The Home Screen](#the-home-screen)
3. [For Coordinators / Admins](#for-coordinators--admins-setting-up-an-exam)
   - [Step 1: Build the exam](#step-1-build-the-exam)
   - [Step 2: Add candidates](#step-2-add-candidates)
   - [Step 3: Print QR badges](#step-3-print-qr-badges)
   - [Step 4: Check students in (exam morning)](#step-4-check-students-in-exam-morning)
   - [Step 5: Get the results](#step-5-get-the-results-reports)
4. [For Examiners](#for-examiners-scoring-students)
   - [Step 1: Start your session](#step-1-start-your-session)
   - [Step 2: Score each student](#step-2-score-each-student)
   - [Step 3: Finish](#step-3-finish)
5. [Settings & Language](#settings--language)
6. [Offline & Syncing](#offline--syncing)
7. [Frequently Asked Questions](#frequently-asked-questions)

---

## Quick Start

| You are a... | Go to | Do this |
|---|---|---|
| **Coordinator** setting up | **Exams** | Create the exam and its stations |
| **Coordinator** on exam day | **Student Check-In** | Assign students to circuits |
| **Examiner** scoring | **Start Exam Session** | Pick your station and score students |
| Anyone wanting results | **Reports** | Download PDF / Excel reports |

---

## The Home Screen

When you open the app you'll see the **Dashboard** (home screen) with:

- **Start Exam Session** (blue button) — for examiners scoring students.
- **Student Check-In** (green button) — for assigning students to circuits.
- Quick links: **Exams 📋**, **Candidates 👥**, **Reports 📊**, **Settings ⚙️**.
- An **online / offline** indicator and a **pending sync** counter.

---

## For Coordinators / Admins (Setting Up an Exam)

### Step 1: Build the exam

1. From the Home screen, tap **Exams 📋**, then **Create Exam**.
2. Enter the **exam name** (and an Arabic name and description if you like).
3. **(Optional) Security PIN** — tick **Enable Admin PIN** to protect the exam, then enter a 4–6 digit PIN and confirm it. You can also add a separate **Reports PIN** for read-only access.
   - ⚠️ **Important:** PIN settings **cannot be changed after the exam is created.**
4. **Add stations** — either:
   - Tap **+ Add Station** to build one by hand, or
   - Tap **📄 Import** to load stations from a Word or text document.
5. For each station, set:
   - **Station type** — History Taking, Physical Examination, Procedure/Skill, or Communication.
   - **Station name** and **time limit** (in minutes).
   - **Scenario** and a list of **tasks** for the student.
   - **Checklist items** — what the examiner scores. Items are split into two groups:
     - *Before findings* — history questions / examination steps.
     - *After findings* — differential diagnosis, investigations, clinical reasoning.
   - For each checklist item, choose a **scoring scheme** (e.g. 2/1/0, 1/0, or a custom set of values) and an optional category label.
   - **Examination Findings** — *History stations only*. Type the findings the examiner reads to the student after they've taken the history.
   - **Global Rating** — turn on to add an overall 0–4 rating for the station.
6. Tap **Save**.
   - If you set a PIN, the app shows **5 backup recovery codes**. **Write these down and keep them safe** — they're the only way to reset a lost PIN.

> **Tip:** You can edit an exam later, but PIN settings are fixed once created.

### Step 2: Add candidates

1. From the Home screen, tap **Candidates 👥**.
2. Add students either way:
   - **Import CSV** — upload a spreadsheet of all candidates at once.
   - **Add Candidate** — enter one student manually (candidate number, name, and stage are required; group is optional).
3. Students appear in a table. You can delete one, or **Clear All** to start over.

### Step 3: Print QR badges

1. From the Home screen, tap **Settings ⚙️**.
2. Tap **Print QR Codes for Candidates**.
3. A printable sheet of QR badges appears (one per student, with their number and name). Tap **Print**.
4. Hand each student their badge — examiners scan these to pull up the right student instantly.

> **No data yet?** Settings also has **Generate Test Data**, which creates a sample exam (3 stations) and 8 test students so you can practise.

### Step 4: Check students in (exam morning)

This assigns each student to a circuit before scoring begins.

1. From the Home screen, tap **Student Check-In** (green).
2. **Select the exam**, then **select a circuit**.
3. For each student, **scan their QR badge** or **search by name/number**, and they're checked in to that circuit.
4. You'll see a running count of how many students are in each circuit. Tap **Remove** to undo a check-in.

> A student can only be checked into **one** circuit — the app prevents duplicates.

### Step 5: Get the results (Reports)

1. From the Home screen, tap **Reports 📊**.
2. **Select the exam.** The app shows how many evaluations and candidates it found.
3. Choose a report type:
   - **Cohort Summary** — results for all students. Download as **Excel** or **PDF**, or **Preview** first.
   - **Candidate Report** — one student's results across all their stations (Excel or PDF).
   - **Station Reports** — a detailed PDF for each individual evaluation.

> **Pass marks:** 60% and above = **Pass**, 50–59% = **Borderline**, below 50% = **Fail**.

---

## For Examiners (Scoring Students)

### Step 1: Start your session

1. From the Home screen, tap **Start Exam Session** (blue).
2. **Select the exam.**
3. **Select your circuit** (or create one if needed).
4. **Select the station** you are examining.
5. **Enter your name** (the app remembers it next time).
6. Tap **Start Session**.

### Step 2: Score each student

1. A box appears to choose the student — **Scan QR Badge 📷** or **search by name/number**.
2. The scoring screen opens with a **countdown timer** at the top.
   - It turns **orange** when under 2 minutes and **red/flashing** under 1 minute.
3. Read the **scenario and tasks** to the student.
4. **Tap a score** for each checklist item. Items are grouped by category; differential/investigation items appear in green further down.
5. *(History stations)* The **Examination Findings** appear in an amber box — read these out when the student asks.
6. Set the **Global Rating (0–4)** and add any **notes**.
7. The **total score, percentage, and a PASS / BORDERLINE / FAIL badge** update live as you score.
8. Tap **Submit Evaluation**.
   - If some items aren't scored, the app asks you to confirm.
   - After submitting, the student picker reopens automatically for the **next student**.

### Step 3: Finish

- When your rotation is done, tap **End Session** to return to the Home screen.
- All your scores are saved on the device and upload to the cloud automatically when online.

---

## Settings & Language

In **Settings ⚙️** you can:

- **Switch language** between **English** and **Arabic** (the layout flips to right-to-left for Arabic).
- See **sync status** — whether cloud sync is on, whether you're online, how many items are waiting to upload, and when the last sync happened.
- Tap **Sync Now** to upload immediately.
- **Generate Test Data** and **Print QR Codes**.

---

## Offline & Syncing

- The app is **offline-first** — you can run an entire exam with no internet, and nothing is lost.
- Everything saves to the device immediately.
- When the device is back online, data uploads to the cloud automatically. You can also force it with **Sync Now** in Settings.
- The Home screen and Settings show a **pending sync** number — that's how many items are still waiting to upload. When it reads **0**, everything is backed up.

---

## Frequently Asked Questions

**Do I need internet during the exam?**
No. The app works completely offline. It syncs automatically once you're back online.

**I forgot the exam's Admin PIN.**
Use one of the **5 backup codes** that were shown when the exam was created. Each code works once.

**A student's QR badge won't scan.**
You can always **search by name or candidate number** instead of scanning. Make sure the camera has permission, and that you're using the app over a secure (https) connection.

**Can two examiners score at the same time?**
Yes. Each examiner runs their own station on their own device, scoring every student who rotates through. Scores merge in the cloud.

**What counts as a pass?**
60% or higher is a pass; 50–59% is borderline; below 50% is a fail.

**Can I change a station's scoring after creating it?**
Yes — open the exam in **Exams** and edit it. (Only the security PIN settings are locked after creation.)

---

*OSCE Examination App — for clinical assessment. Works on any modern browser, online or offline.*
