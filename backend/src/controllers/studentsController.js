import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
import AttendanceSchedule from "../models/AttendanceSchedule.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// ── PKT (Pakistan Standard Time, UTC+5, no DST) helpers ──────────────────
// Pakistan does not observe daylight saving, so a fixed +5h offset from UTC
// is always correct — no timezone database or env var needed. This makes
// "today" / "this month" correct regardless of which timezone the server's
// host machine/container is actually running in (e.g. a US or EU data
// center defaulting to UTC).
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

function pktNow() {
  return new Date(Date.now() + PKT_OFFSET_MS);
}

// "YYYY-MM" in PKT
const currentMonth = () => pktNow().toISOString().slice(0, 7);

// "YYYY-MM-DD" in PKT
const todayPKT = () => pktNow().toISOString().slice(0, 10);

// "YYYY-MM-DD" in PKT for an ARBITRARY date (not just "now"). Used to compare
// stored attendance dates against a PKT day string consistently — using raw
// toISOString() here (UTC) instead would drift a calendar day for any
// timestamp between 12:00 AM–4:59 AM PKT.
const dayStrPKT = (d) => new Date(new Date(d).getTime() + PKT_OFFSET_MS).toISOString().slice(0, 10);

// "YYYY-MM" in PKT for an arbitrary date — same reasoning as dayStrPKT above.
const monthStrPKT = (d) => new Date(new Date(d).getTime() + PKT_OFFSET_MS).toISOString().slice(0, 7);

// How close two face descriptors need to be (Euclidean distance) to be treated
// as the same person. face-api.js style 128-d descriptors: ~0.5-0.6 is a
// reasonable "same person" threshold. Lower = stricter (fewer false matches).
const FACE_MATCH_THRESHOLD = 0.5;

function euclideanDistance(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) {
    return Infinity;
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

// Returns the existing student (name only) whose contact info collides with
// the given email/phone, or null. excludeId lets an update skip itself.
async function checkDuplicateContact(email, phone, excludeId) {
  const or = [];
  if (email) or.push({ email: String(email).toLowerCase().trim() });
  if (phone) or.push({ phone: String(phone).trim() });
  if (!or.length) return null;

  const query = { $or: or };
  if (excludeId) query._id = { $ne: excludeId };

  const existing = await Student.findOne(query).select("name email phone").lean();
  if (!existing) return null;

  const field = email && existing.email === String(email).toLowerCase().trim() ? "email" : "phone";
  return { field, existing };
}

// Returns the existing student whose registered face closely matches the
// given descriptor, or null. excludeId lets an update skip itself.
async function checkDuplicateFace(descriptor, excludeId) {
  if (!Array.isArray(descriptor) || descriptor.length === 0) return null;

  const query = { faceDescriptor: { $exists: true, $ne: [] } };
  if (excludeId) query._id = { $ne: excludeId };

  const candidates = await Student.find(query).select("name faceDescriptor").lean();
  for (const c of candidates) {
    if (euclideanDistance(descriptor, c.faceDescriptor) < FACE_MATCH_THRESHOLD) {
      return c;
    }
  }
  return null;
}

// Recompute the overall payment status from the challans list: "due" if
// anything is still pending, "paid" if every challan is cleared, "n/a" for
// students with no fee at all (free internship).
function recomputeStatus(student) {
  if (student.registrationFee > 0 || student.monthlyFee > 0) {
    const hasPending = student.challans.some((c) => c.status !== "paid");
    student.paymentStatus = hasPending ? "due" : student.challans.length ? "paid" : "n/a";
  } else {
    student.paymentStatus = "n/a";
  }
}

// Recompute the attendance progress bar from attendanceHistory. "leave" days
// (weekly off / holidays) are excluded from both sides of the ratio so they
// don't drag a student's percentage down — they're not the student's fault.
function recomputeAttendance(student) {
  const counted = student.attendanceHistory.filter((r) => r.status !== "leave");
  const total = counted.length;
  const attended = counted.filter((r) => r.status === "present" || r.status === "late").length;
  student.attendancePercent = total ? Math.round((attended / total) * 100) : 0;
}

function recalcAttendancePercent(history = []) {
  const counted = history.filter((r) => r.status !== "leave");
  if (!counted.length) return 0;
  const attended = counted.filter((r) => r.status === "present" || r.status === "late").length;
  return Math.round((attended / counted.length) * 100);
}

// Marks each challan paid/pending based ONLY on payments tagged with that
// exact challan's _id. This is the key fix: previously reconciliation matched
// on "month" alone, so paying one challan (e.g. Monthly Fee) could wrongly
// mark a DIFFERENT challan in the same month (e.g. Registration Fee) as paid
// too, making pending dues show 0 while money was still owed.
function reconcileChallans(student) {
  student.challans.forEach((c) => {
    const paidForChallan = student.paymentHistory
      .filter((p) => p.challanId && String(p.challanId) === String(c._id))
      .reduce((s, p) => s + p.amount, 0);

    if (paidForChallan >= c.amount) {
      c.status = "paid";
      if (!c.paidOn) c.paidOn = new Date();
    } else {
      c.status = "pending";
      c.paidOn = undefined;
    }
  });
}

// Generates this month's (PKT month) monthly-fee challan for every ACTIVE
// student that doesn't already have one for the current month. Skips
// inactive students and students with no monthly fee.
//
// PERFORMANCE: previously this looped over every active student and called
// `.save()` individually — N students meant N sequential DB round trips.
// It now does a single `bulkWrite()` with only the students that actually
// need a new challan this month, so it's always one DB round trip
// regardless of how many students exist.
//
// Exported so it can be called from the HTTP route, the cron job, AND lazily
// from list() below — this last one is what makes challan generation
// reliable even if the cron job was never running.
export async function generateMonthlyChallans() {
  const month = currentMonth();

  // Only fetch the fields we actually need to decide + build the update.
  const students = await Student.find(
    { active: true, monthlyFee: { $gt: 0 } },
    { challans: 1, monthlyFee: 1 }
  );

  const ops = [];
  for (const s of students) {
    const already = s.challans.some((c) => c.month === month && c.label === "Monthly Fee");
    if (already) continue;
    ops.push({
      updateOne: {
        filter: { _id: s._id },
        update: {
          $push: {
            challans: { month, label: "Monthly Fee", amount: s.monthlyFee, status: "pending" },
          },
        },
      },
    });
  }

  if (ops.length) {
    await Student.bulkWrite(ops, { ordered: false });
  }
  return ops.length;
}

// POST /api/students/generate-challans (manual trigger, same logic as the cron job)
export const generateChallansNow = asyncHandler(async (req, res) => {
  const created = await generateMonthlyChallans();
  res.json({ message: `Monthly challans generated for active students. (${created} created)` });
});

// POST /api/students/:id/challans
// Manually generate ONE fee challan for a single student — e.g. a custom/
// one-off charge, or a monthly challan the admin wants to raise ahead of the
// automatic 1st-of-the-month generation. Separate from generateMonthlyChallans
// above, which only ever creates the standard "Monthly Fee" challan in bulk
// for every active student.
export const addChallan = asyncHandler(async (req, res) => {
  const { month, label, amount } = req.body;
  const amt = Number(amount);

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ message: "A valid month (YYYY-MM) is required" });
  }
  if (!amt || amt <= 0) {
    return res.status(400).json({ message: "A valid challan amount is required" });
  }

  const student = await Student.findById(req.params.id);
  if (!student) return res.status(404).json({ message: "Not found" });

  const challanLabel = (label || "").trim() || "Monthly Fee";

  // Avoid raising the exact same challan twice by mistake (same month + label, still pending).
  const duplicate = student.challans.some(
    (c) => c.month === month && c.label === challanLabel && c.status !== "paid"
  );
  if (duplicate) {
    return res.status(409).json({
      message: `${student.name} already has a pending "${challanLabel}" challan for ${month}.`,
    });
  }

  student.challans.push({ month, label: challanLabel, amount: amt, status: "pending" });
  recomputeStatus(student);

  await student.save();
  res.status(201).json(student);
});

async function getTeacherAccess(req) {
  if (req.user?.role !== "teacher") return null;
  const teacher = await Teacher.findOne({ userId: req.user.id }).populate("batchIds", "name");
  if (!teacher) return null;
  return { teacher, batchNames: (teacher.batchIds || []).map((b) => b.name).filter(Boolean) };
}

async function teacherCanAccessStudent(req, student) {
  if (req.user?.role !== "teacher") return true;
  const access = await getTeacherAccess(req);
  if (!access) return false;
  return student.active !== false && access.batchNames.includes(student.batch || "");
}

// GET /api/students/recognition
// Small, purpose-built payload for face/fingerprint attendance. Keeping biometric
// descriptors out of the normal Students list avoids sending 128 numbers per
// student on every admin page load.
export const recognitionList = asyncHandler(async (req, res) => {
  let query = { active: true };
  if (req.user?.role === "teacher") {
    const access = await getTeacherAccess(req);
    if (!access) return res.status(403).json({ message: "Teacher profile is not linked to this account" });
    if (!access.batchNames.length) return res.json([]);
    query = { active: true, batch: { $in: access.batchNames } };
  }

  const students = await Student.find(query)
    .select("_id name faceDescriptor fingerprintId")
    .lean();

  res.json(students.map((s) => ({
    _id: s._id,
    name: s.name,
    faceDescriptor: s.faceDescriptor || [],
    fingerprintId: s.fingerprintId || "",
  })));
});

// GET /api/students
export const list = asyncHandler(async (req, res) => {
  // Do NOT generate monthly challans on every page load. The Vercel cron
  // endpoint handles the monthly job; running it here forced an extra Mongo
  // read (and sometimes a bulk write) before the actual student list could
  // even start loading.
  let query = {};
  if (req.user?.role === "teacher") {
    const access = await getTeacherAccess(req);
    if (!access) return res.status(403).json({ message: "Teacher profile is not linked to this account" });
    if (!access.batchNames.length) return res.json([]);
    query = { batch: { $in: access.batchNames }, active: true };

    const students = await Student.find(query)
      .select("_id name courseName courseType batch active attendancePercent attendanceHistory faceDescriptor fingerprintId")
      .sort({ createdAt: -1 })
      .lean();

    return res.json(students.map((s) => ({
      _id: s._id,
      name: s.name,
      courseName: s.courseName,
      courseType: s.courseType,
      batch: s.batch,
      active: s.active,
      attendancePercent: s.attendancePercent,
      attendanceHistory: s.attendanceHistory,
      faceDescriptor: s.faceDescriptor || [],
      fingerprintId: s.fingerprintId || "",
    })));
  }

  // Keep the normal Students payload lean. In particular, do NOT send the
  // 128-number face descriptor for every student just to show the small
  // "face enrolled" icon. Mongo can calculate that boolean server-side.
  const students = await Student.aggregate([
    { $match: query },
    { $sort: { createdAt: -1 } },
    {
      $project: {
        _id: 1, name: 1, email: 1, phone: 1, courseType: 1, courseName: 1, duration: 1,
        batch: 1, joiningDate: 1, registrationFee: 1, monthlyFee: 1, active: 1,
        attendancePercent: 1, paymentStatus: 1, timing: 1, fingerprintId: 1,
        "paymentHistory.amount": 1,
        "paymentHistory.date": 1,
        "paymentHistory.challanId": 1,
        "challans.month": 1,
        "challans.label": 1,
        "challans.amount": 1,
        "challans.paidAmount": 1,
        "challans.status": 1,
        "challans.generatedOn": 1,
        createdAt: 1,
        faceEnrolled: {
          $gt: [
            { $size: { $ifNull: ["$faceDescriptor", []] } },
            0,
          ],
        },
      },
    },
  ]);

  res.json(students);
});

// GET /api/students/:id
export const getOne = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.params.id);
  if (!student) return res.status(404).json({ message: "Not found" });
  if (req.user?.role === "teacher") {
    if (!(await teacherCanAccessStudent(req, student))) return res.status(403).json({ message: "You can only access students in your assigned batches" });
    return res.json({ _id:student._id, name:student.name, courseName:student.courseName, courseType:student.courseType, batch:student.batch, active:student.active, attendancePercent:student.attendancePercent, attendanceHistory:student.attendanceHistory, faceDescriptor:student.faceDescriptor || [], fingerprintId:student.fingerprintId || "" });
  }
  res.json(student);
});

// POST /api/students
// Creates the student (after duplicate email/phone/face checks) and, if the
// student has fees, immediately creates their Registration Fee and/or
// joining-month Monthly Fee challans.
export const create = asyncHandler(async (req, res) => {
  const { email, phone, faceDescriptor } = req.body;

  const dupContact = await checkDuplicateContact(email, phone);
  if (dupContact) {
    return res.status(409).json({
      message: `A student with this ${dupContact.field} is already registered (${dupContact.existing.name}).`,
      field: dupContact.field,
    });
  }

  if (Array.isArray(faceDescriptor) && faceDescriptor.length) {
    const faceMatch = await checkDuplicateFace(faceDescriptor);
    if (faceMatch) {
      return res.status(409).json({
        message: `This face is already registered under ${faceMatch.name}. The same student can't be registered twice.`,
        field: "face",
      });
    }
  }

  let student;
  try {
    student = await Student.create(req.body);
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || { email: 1 })[0];
      return res.status(409).json({ message: `A student with this ${field} is already registered.`, field });
    }
    throw err;
  }

  const challanMonth = student.joiningDate
    ? monthStrPKT(student.joiningDate)
    : currentMonth();

  let needsSave = false;
  if (student.registrationFee > 0) {
    student.challans.push({ month: challanMonth, label: "Registration Fee", amount: student.registrationFee, status: "pending" });
    needsSave = true;
  }
  if (student.monthlyFee > 0) {
    student.challans.push({ month: challanMonth, label: "Monthly Fee", amount: student.monthlyFee, status: "pending" });
    needsSave = true;
  }
  if (needsSave) await student.save();

  res.status(201).json(student);
});

// PUT /api/students/:id
export const update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { email, phone, faceDescriptor } = req.body;

  if (email || phone) {
    const dupContact = await checkDuplicateContact(email, phone, id);
    if (dupContact) {
      return res.status(409).json({
        message: `A student with this ${dupContact.field} is already registered (${dupContact.existing.name}).`,
        field: dupContact.field,
      });
    }
  }

  if (Array.isArray(faceDescriptor) && faceDescriptor.length) {
    const faceMatch = await checkDuplicateFace(faceDescriptor, id);
    if (faceMatch) {
      return res.status(409).json({
        message: `This face is already registered under ${faceMatch.name}. The same student can't be registered twice.`,
        field: "face",
      });
    }
  }

  let student;
  try {
    student = await Student.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || { email: 1 })[0];
      return res.status(409).json({ message: `A student with this ${field} is already registered.`, field });
    }
    throw err;
  }
  if (!student) return res.status(404).json({ message: "Not found" });
  res.json(student);
});

// DELETE /api/students/:id
export const remove = asyncHandler(async (req, res) => {
  const student = await Student.findByIdAndDelete(req.params.id);
  if (!student) return res.status(404).json({ message: "Not found" });
  res.json({ message: "Deleted", id: req.params.id });
});

// POST /api/students/:id/payments
// A payment ALWAYS pays off one specific challan (challanId), not just "a
// month". This is what fixes payments reconciling the wrong due. The amount
// is capped at that challan's remaining balance so a student can't overpay
// or accidentally mark an unrelated challan as paid.
export const addPayment = asyncHandler(async (req, res) => {
  const { amount, note, date, challanId } = req.body;
  const amt = Number(amount);

  if (!amt || amt <= 0) {
    return res.status(400).json({ message: "A valid payment amount is required" });
  }
  if (!challanId) {
    return res.status(400).json({ message: "Select which challan this payment is for" });
  }

  const student = await Student.findById(req.params.id);
  if (!student) return res.status(404).json({ message: "Not found" });

  const challan = student.challans.id(challanId);
  if (!challan) return res.status(404).json({ message: "Challan not found" });
  if (challan.status === "paid") {
    return res.status(400).json({ message: "This challan is already fully paid" });
  }

  const alreadyPaid = student.paymentHistory
    .filter((p) => p.challanId && String(p.challanId) === String(challanId))
    .reduce((s, p) => s + p.amount, 0);
  const remaining = challan.amount - alreadyPaid;

  if (amt > remaining) {
    return res.status(400).json({ message: `Amount exceeds the pending due of ₨${remaining} for this challan` });
  }

  student.paymentHistory.push({
    amount: amt,
    date: date ? new Date(date) : new Date(),
    note: note || "",
    forMonth: challan.month,
    challanId: challan._id,
  });

  reconcileChallans(student);
  recomputeStatus(student);

  await student.save();
  res.status(201).json(student);
});

// DELETE /api/students/:id/payments/:paymentId
// Remove a single payment entry (e.g. entered by mistake), then re-reconcile
// challans (a challan may flip back to "pending") and recompute status.
export const removePayment = asyncHandler(async (req, res) => {
  const { id, paymentId } = req.params;
  const student = await Student.findById(id);
  if (!student) return res.status(404).json({ message: "Not found" });

  student.paymentHistory = student.paymentHistory.filter((p) => String(p._id) !== paymentId);

  reconcileChallans(student);
  recomputeStatus(student);

  await student.save();
  res.json(student);
});

// DELETE /api/students/:id/challans/:challanId
// Removes a single fee challan (e.g. one that was generated by mistake, for
// a student who shouldn't have been charged). Blocked if any payment has
// already been recorded against it, so a real payment can never be left
// pointing at a challan that no longer exists — the payment(s) must be
// removed first via removePayment above.
export const removeChallan = asyncHandler(async (req, res) => {
  const { id, challanId } = req.params;
  const student = await Student.findById(id);
  if (!student) return res.status(404).json({ message: "Not found" });

  const challan = student.challans.id(challanId);
  if (!challan) return res.status(404).json({ message: "Challan not found" });

  const hasPayments = student.paymentHistory.some(
    (p) => p.challanId && String(p.challanId) === String(challanId)
  );
  if (hasPayments) {
    return res.status(400).json({
      message: "This challan has payment(s) recorded against it. Remove the payment(s) first, then delete the challan.",
    });
  }

  student.challans.pull(challanId);
  recomputeStatus(student);

  await student.save();
  res.json(student);
});

// POST /api/students/:id/attendance
// Records ONE attendance entry per student per day. If that date is already
// marked, this is rejected (not silently overwritten) so duplicate clicks
// don't quietly change a day's record — the response names the student and
// their existing status.
export const markAttendance = asyncHandler(async (req, res) => {
  const { date, status, note, type } = req.body;
  if (!date || !status) {
    return res.status(400).json({ message: "date and status are required" });
  }

  const student = await Student.findById(req.params.id);
  if (!student) return res.status(404).json({ message: "Not found" });
  if (!(await teacherCanAccessStudent(req, student))) return res.status(403).json({ message: "You can only mark attendance for students in your assigned batches" });

  const targetDay = dayStrPKT(date);
  const existing = student.attendanceHistory.find(
    (r) => dayStrPKT(r.date) === targetDay
  );

  if (existing) {
    return res.status(409).json({
      message: `${student.name} is already marked today (as ${existing.status}).`,
      field: "attendance",
    });
  }

  student.attendanceHistory.push({
    date: new Date(date),
    status,
    note: note || "",
    type: type === "face-scan" ? "face-scan" : type === "fingerprint" ? "fingerprint" : "manual",
  });

  recomputeAttendance(student);

  await student.save();
  if (req.user?.role === "teacher") {
    if (!(await teacherCanAccessStudent(req, student))) return res.status(403).json({ message: "You can only access students in your assigned batches" });
    return res.json({ _id:student._id, name:student.name, courseName:student.courseName, courseType:student.courseType, batch:student.batch, active:student.active, attendancePercent:student.attendancePercent, attendanceHistory:student.attendanceHistory, faceDescriptor:student.faceDescriptor || [], fingerprintId:student.fingerprintId || "" });
  }
  res.json(student);
});

// For every ACTIVE student who has no attendance record yet for the given
// date: if that date is a configured weekly-off day or holiday for their
// course type, mark them "leave"; otherwise mark them "absent". Students who
// already have a record for that date (manual or face-scan) are left alone —
// this never overwrites a real entry.
// Exported so it can be called from the manual trigger route below AND from
// a daily cron job in server.js (see the note in the route file).
export async function runAutoAttendance(forDateStr) {
  const dateStr = forDateStr || todayPKT(); // PKT "today", not UTC
  const weekday = new Date(`${dateStr}T00:00:00+05:00`).getUTCDay(); // 0 = Sunday ... 6 = Saturday

  const schedules = await AttendanceSchedule.find();
  const scheduleByType = Object.fromEntries(schedules.map((s) => [s.courseType, s]));
  
  // Get teacher schedule (personType: "Teacher")
  const teacherSchedule = schedules.find(s => s.personType === "Teacher");

  // ---- STUDENTS AUTO-ATTENDANCE ----
  const students = await Student.find({ active: true });
  let studentLeaveCount = 0;
  let studentAbsentCount = 0;

  for (const s of students) {
    const already = s.attendanceHistory.find(
      (r) => dayStrPKT(r.date) === dateStr
    );
    if (already) continue;

    const sched = scheduleByType[s.courseType];
    const isWeeklyOff = sched?.weeklyOffDays?.includes(weekday);
    const holidayMatch = sched?.holidays?.find((h) => h.date === dateStr);

    if (isWeeklyOff || holidayMatch) {
      s.attendanceHistory.push({
        date: new Date(dateStr),
        status: "leave",
        note: holidayMatch?.label || "Weekly off",
        type: "auto",
      });
      studentLeaveCount++;
    } else {
      s.attendanceHistory.push({
        date: new Date(dateStr),
        status: "absent",
        note: "Auto-marked — no attendance recorded",
        type: "auto",
      });
      studentAbsentCount++;
    }

    recomputeAttendance(s);
    await s.save();
  }

  // ---- TEACHERS AUTO-ATTENDANCE ----
  const teachers = await Teacher.find({ active: true });
  let teacherLeaveCount = 0;
  let teacherAbsentCount = 0;

  for (const t of teachers) {
    const already = t.attendanceHistory.find(
      (r) => dayStrPKT(r.date) === dateStr
    );
    if (already) continue;

    const isWeeklyOff = teacherSchedule?.weeklyOffDays?.includes(weekday);
    const holidayMatch = teacherSchedule?.holidays?.find((h) => h.date === dateStr);
    
    // Check if teacher is on leave
    const onLeave = t.leaveHistory?.find(
      l => dateStr >= dayStrPKT(l.fromDate) && dateStr <= dayStrPKT(l.toDate)
    );

    if (isWeeklyOff || holidayMatch || onLeave) {
      t.attendanceHistory.push({
        date: new Date(dateStr),
        status: "leave",
        note: onLeave?.reason || holidayMatch?.label || "Weekly off",
        type: "auto",
      });
      teacherLeaveCount++;
    } else {
      t.attendanceHistory.push({
        date: new Date(dateStr),
        status: "absent",
        note: "Auto-marked — no attendance recorded",
        type: "auto",
      });
      teacherAbsentCount++;
    }

    t.attendancePercent = recalcAttendancePercent(t.attendanceHistory);
    await t.save();
  }

  return { 
    date: dateStr, 
    students: {
      leaveCount: studentLeaveCount,
      absentCount: studentAbsentCount,
      checked: students.length
    },
    teachers: {
      leaveCount: teacherLeaveCount,
      absentCount: teacherAbsentCount,
      checked: teachers.length
    }
  };
}

// POST /api/students/run-auto-attendance   Body: { date? }  (defaults to today, PKT)
export const runAutoAttendanceNow = asyncHandler(async (req, res) => {
  const result = await runAutoAttendance(req.body?.date);
  res.json({
    message: `Auto-attendance applied for ${result.date}: ${result.students.leaveCount + result.teachers.leaveCount} marked leave, ${result.students.absentCount + result.teachers.absentCount} marked absent.`,
    ...result,
  });
});

