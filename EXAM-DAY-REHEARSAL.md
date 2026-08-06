# Exam day rehearsal

Everything in this app has been verified in a headless browser. That catches
logic, and it caught a lot — but it cannot tell you whether a printed badge
scans under your exam hall's lighting, whether the badge sheet fits your paper,
or whether an examiner can work the screen while a student is talking to them.

This is a run-through for those things. Budget an hour, use the real devices
and the real printer, and act like it is the actual exam. Take one colleague to
play the student.

Each check says what to do and what you should see. Anything that fails is
worth knowing now rather than at 8am on the day.

---

## 1. Install, don't bookmark

- [ ] On each examiner tablet, open the app and **add it to the home screen**
      (Safari: Share → Add to Home Screen. Chrome: menu → Install app).
- [ ] Launch it from the home-screen icon, not the browser.

**Why this matters more than it looks.** The app holds a day's marks in browser
storage. For a bookmarked tab that storage is evictable — Safari clears
script-writable storage for sites not revisited for about a week, and Chrome
evicts under pressure. An installed app is far more durable. This is the single
cheapest thing you can do to protect exam data.

- [ ] Confirm it opens without browser chrome (no address bar).

---

## 2. Badges: printing

- [ ] Settings → choose the exam under **Print badges for** → **Print QR Codes**.
- [ ] Press **Print** and check the print preview *before* sending it to paper.

You should see: **only badges.** No Settings page, no language buttons, no sync
panel, three badges to a row.

- [ ] Print a real page on the real printer.
- [ ] Check the page count matches the preview — badges should flow across as
      many pages as needed, with none split across a page break.
- [ ] Check each badge shows the QR, the college ID, the name(s), the exam name
      and the group.
- [ ] Check the badges are in college-ID order. You will be cutting these into
      a pile.

**If the QR prints too small to scan reliably**, that is the thing to catch
here. Try one page, cut out one badge, and take it to the next section before
printing a hundred.

---

## 3. Badges: scanning

This is the check that matters most, and the one no automated test can do.

- [ ] On a tablet, start a session: Dashboard → Start Exam Session → pick exam,
      circuit, station, enter your name.
- [ ] Tap **Scan QR Badge** and scan a printed badge.

- [ ] It should open a **confirmation panel** showing that student's name and
      college ID — not jump straight into scoring.
- [ ] Confirm the name is the right student.

Now the awkward conditions, because exam halls are not photo studios:

- [ ] Scan under the actual hall lighting.
- [ ] Scan a badge that is slightly creased.
- [ ] Scan at arm's length, the way an examiner will while seated.
- [ ] Scan with the badge on a lanyard, hanging and swinging slightly.

**Wrong-exam rejection.** If you have badges from a previous exam, scan one.

- [ ] It should refuse it by name: *"This badge is for … , not …"*.
- [ ] If it is an old-format badge (printed before this version), it should
      still work but warn you to reprint.

**Fallbacks.** Assume the camera fails, because sometimes it will.

- [ ] Type a college ID into the box and press **Find** → confirmation panel.
- [ ] Type a partial name → the roster filters → tap a student → confirmation
      panel.
- [ ] Type a college ID that does not exist → it should find nobody, not offer
      a near match.

---

## 4. Check-in and circuits

- [ ] Dashboard → **Student Check-In** → pick the exam.
- [ ] If there are no circuits, create one right there.
- [ ] Check a student into Circuit 1, and a different student into Circuit 2.
- [ ] Try checking the same student in twice — it should refuse and tell you
      which circuit they are already in, by number.

**The circuit constraint**, which is new:

- [ ] Start a session at a station in **Circuit 1**.
- [ ] Open the candidate list. It should show only Circuit 1's students, with a
      **Show all** toggle.
- [ ] Use Show all, then pick the Circuit 2 student.
- [ ] You should get a red **Wrong circuit** warning naming both circuits, and
      the button should read **Score anyway** rather than Start scoring.

Note this only applies when the exam uses check-in. If you skip check-in
entirely, everything behaves as before — there is nothing to check against.

---

## 5. A real station, at real speed

- [ ] Run a full station on a colleague: identify them, score every checklist
      item, add the global rating, write a note, submit.
- [ ] Watch the timer for the full station length. Check it turns amber near the
      end and red in the last minute.
- [ ] Time yourself. If scoring takes longer than the station, the layout needs
      work — tell me what slowed you down.
- [ ] Submit with some items deliberately unscored. It should warn you before
      accepting.
- [ ] After submitting, the candidate list should reopen for the next student,
      still at the same station.

- [ ] Switch the app to Arabic and repeat one evaluation. Check the layout does
      not break and names read correctly in both scripts.

---

## 6. Offline, which is the normal case

- [ ] Put the tablet in aeroplane mode.
- [ ] Score two students end to end.

Everything should work exactly as before. Nothing should hang, error, or wait.

- [ ] Check the chip in the exam header reads **"2 unsent"**.
- [ ] Close the app completely, reopen it from the home screen, and confirm the
      marks are still there.

- [ ] Turn connectivity back on. Within a minute the chip should clear by
      itself — no button press.

If your hall genuinely has no signal, see the note at the end.

---

## 7. Late registration

- [ ] At a station, tap **Student not on the list? → Register them here**.
- [ ] Enter a college ID and name, register, and score them.
- [ ] Enter a college ID that already exists — it should offer you that student
      instead of creating a second record.
- [ ] Afterwards, go to Candidates. The student should appear in an amber
      **"Registered on exam day — needs checking"** panel, and be tagged
      *unverified* in the roster.
- [ ] Press **ID verified** and confirm the flag clears.

---

## 8. Backup, and getting the file off the device

- [ ] End a session. It should offer a backup file — accept it.
- [ ] Find the file on the tablet. **Work out how you will collect it**: email
      to yourself, AirDrop, a USB-C stick, a shared drive. Do it once now.

This is the step people skip. A backup sitting on the tablet is not a second
copy — the tablet is the thing that fails.

**Prove the recovery works**, on a second device:

- [ ] On a different tablet (or the same one after Settings → clear data),
      Settings → choose the backup file under restore.
- [ ] Confirm the counts it reports match what was on the original device.
- [ ] Check the marks are actually there — open Reports and look.

---

## 9. Two tablets at once

- [ ] Run two stations simultaneously on two devices, same exam, same circuit.
- [ ] Score the same student at both stations.
- [ ] Sync both (or restore both backups onto one machine) and confirm you end
      up with both marks, not one.

---

## Afterwards

Tell me anything that failed, felt slow, or needed explaining to the examiner.
The screen-level things — button sizes, how much scrolling a long checklist
needs, whether the timer is visible from where an examiner sits — are exactly
what I cannot see from here and are usually quick to fix.

**If the hall has no signal at all:** turn off Auto Sync in Settings on each
tablet, and make the backup file part of the formal procedure — every examiner
downloads at the end of their session, one person collects them all onto a
laptop before anybody leaves the building. That is the mechanism you can rely
on with zero connectivity.
