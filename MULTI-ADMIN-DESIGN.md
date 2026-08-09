# Multiple admins — design note

Written 2026-08-10, before it was built, so the reasoning survives.

**The requirement:** several admins, each responsible for their own exams, with
no mixing between them. The prompting case is one admin per stage — stage 2 and
stage 4 run separately and should not see each other's work.

**The decision:** scope by **exam ownership**, not by stage. And it needs real
accounts to mean anything.

---

## Where things stand today

There is no boundary of any kind. Every device shows every screen, and any
device can delete an exam, clear the roster, restore over the top, read every
mark in every circuit, and change sync settings.

There are also no accounts. Devices sign in to Firebase anonymously, purely so
the Firestore rules have an identity to require. Every anonymous session can
read everything, so a second admin can already read the first's marks with no
effort.

## Why the boundary should be the exam, not the stage

Stage is a property of a cohort, not an access boundary, and it breaks quickly.

Students move between stages: a stage-2 student becomes a stage-4 student. A
candidate is deliberately **one person, one college ID, institution-wide** —
that is what makes badge scanning unambiguous and duplicate detection work.
Scoping by the stage label would fight that model, and the first student to
progress a year would expose it.

Own the exam instead, and everything else follows from scoping already built:

| Thing | How it is already scoped |
|---|---|
| Students | enrolled in exams via `examIds` |
| Circuits | belong to an exam |
| Check-ins / circuit assignments | carry `examId` |
| Evaluations | carry `examId` |
| Badges | encode the exam, and a wrong-exam badge is refused |

So this needs **one new relationship — exam → owner** — and the whole tree is
scoped. No new concepts, and nothing fighting the identity model.

It is also more flexible than stage allows: a visiting examiner for a single
exam, a department running two stages, two admins sharing one exam. "Stage 4
admin" then simply means somebody who owns the stage-4 exams.

## Why it cannot be done client-side

Filtering by owner in the app would be a filter in JavaScript, on a device the
user controls, against a database that already permits any anonymous session to
read everything. Clearing site data resets it. That stops accidents, not people.

Anyone relying on it to keep one stage's marks away from another stage's admin
would be relying on something that does not hold.

Real separation needs three things together:

1. **Accounts** — Firebase Auth email/password, replacing anonymous sign-in
2. **An owner recorded on each exam** — see the open question below
3. **Firestore rules that check it** server-side, so the filter is enforced
   where the user cannot reach it

Any one or two of those without the third is theatre.

## Owner: a group, not a person

Recommended: exams are owned by a **group** with members, even when a group
begins with one person in it.

A group survives somebody leaving the department; a personal owner does not, and
recovering an orphaned exam means an admin editing the database by hand. The
cost of a group now is one extra collection.

```
groups/{groupId}          name, members: [uid]
exams/{examId}            ownerGroupId
```

Rules then read roughly: you may read or write an exam if you are a member of
its owning group, and you may read an evaluation if you are a member of the
group owning the exam it belongs to.

## What this does not change

Candidates stay institution-wide and unscoped. They are people, not exam
records, and the same student legitimately appears to two admins if they sit
two exams. Visibility is a matter of which exams you own, not which student
records exist.

## Sequencing

**Not before the next exam.** Sync across devices and the admin/examiner
boundary are what make that exam work; this does not. Doing it under time
pressure with 450 students loaded is the wrong moment.

**After it**, and the steps are short because the data model already suits:

1. Enable email/password auth alongside anonymous, so existing devices keep
   working during the transition
2. Add `ownerGroupId` to `ExamTemplate`; migrate existing exams to a first group
3. Rewrite `firestore.rules` to check group membership
4. Add group management to the admin UI
5. Retire anonymous sign-in once every device has an account

Step 3 is the one that actually creates the boundary. Steps 1, 2 and 4 are
plumbing.

## Related

- `DEPLOYING.md` — how the rules are deployed, and the ordering that matters
- `commercial upgrade/COMMERCIAL-PLAN.md` — this is Phase 1, arrived at from a
  real requirement rather than a roadmap
- The `passwords` collection in the shared `skill-lab-web` project is still
  world-readable and world-writable. It belongs to another application, and it
  should be dealt with before or alongside any of this.
