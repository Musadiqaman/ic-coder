import Attendance from "../models/Attendance.js";
import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
import Batch from "../models/Batch.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Present window: 9:00 AM – 2:00 PM (Pakistan time). Anything scanned after 2:00 PM counts as "late".
const LATE_AFTER_MIN = 14 * 60; // 2:00 PM, in minutes-from-midnight
const TZ = "Asia/Karachi";

// Returns YYYY-MM-DD for a given Date, always computed in Pakistan's local
// calendar day — regardless of what timezone the server machine itself runs in.
// (This is the fix: previously we used now.toISOString().slice(0,10), which
// is UTC and rolls over to the "next day" 5 hours late relative to PKT — e.g.
// at 12:19 AM PKT, UTC is still 7:19 PM the PREVIOUS day, so "today" was
// being computed as yesterday.)
function localDateStr(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d); // en-CA -> YYYY-MM-DD
}

// Minutes-from-midnight in Pakistan local time, for the present/late cutoff.
function localMinutesNow(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour").value);
  const m = Number(parts.find((p) => p.type === "minute").value);
  return h * 60 + m;
}

export const list = asyncHandler(async (req, res) => {
  const { date } = req.query;
  const filter = {};
  if (date) {
    const start = new Date(`${date}T00:00:00+05:00`);
    const end = new Date(`${date}T00:00:00+05:00`); end.setUTCDate(end.getUTCDate() + 1);
    filter.checkedInAt = { $gte: start, $lt: end };
  }
  if (req.user?.role === "teacher") {
    const teacher = await Teacher.findOne({ userId: req.user.id }).populate("batchIds", "name");
    if (!teacher) return res.status(403).json({ message: "Teacher profile is not linked to this account" });
    const batchNames = (teacher.batchIds || []).map((b) => b.name);
    const students = batchNames.length ? await Student.find({ batch: { $in: batchNames }, active: true }).select("_id") : [];
    filter.$or = [
      { personType: "Teacher", refId: teacher._id },
      { personType: "Student", refId: { $in: students.map((s) => s._id) } },
    ];
  }
  const items = await Attendance.find(filter).sort({ checkedInAt: -1 }).lean();
  res.json(items);
});

function recalcAttendancePercent(history) {
  const counted = history.filter((h) => h.status !== "leave");
  if (counted.length === 0) return 100;
  const attended = counted.filter((h) => h.status === "present" || h.status === "late").length;
  return Math.round((attended / counted.length) * 100);
}

// Compare using the SAME local-day function as everywhere else, not toISOString.
const sameDay = (date, dayStr) => date && localDateStr(date) === dayStr;

export const checkIn = asyncHandler(async (req, res) => {
  const { personName, personType, refId, method } = req.body;
  if (!personName || !personType) {
    return res.status(400).json({ message: "personName and personType are required" });
  }

  const now = new Date();
  const dayStr = localDateStr(now);

  let person = null;
  if (personType === "Student" && refId) {
    person = await Student.findById(refId);
    if (person) {
      const existing = person.attendanceHistory.find((h) => sameDay(h.date, dayStr));
      if (existing) {
        return res.status(200).json({
          alreadyMarked: true,
          personName,
          status: existing.status,
        });
      }
    }
  } else if (personType === "Teacher" && refId) {
    person = await Teacher.findById(refId);
    if (person) {
      const existing = person.attendanceHistory.find((h) => sameDay(h.date, dayStr));
      if (existing) {
        return res.status(200).json({
          alreadyMarked: true,
          personName,
          status: existing.status,
        });
      }
    }
  }

  if (req.user?.role === "teacher") {
    const me = await Teacher.findOne({ userId: req.user.id }).populate("batchIds", "name");
    if (!me) return res.status(403).json({ message: "Teacher profile is not linked to this account" });
    if (personType === "Teacher") {
      if (!refId || String(refId) !== String(me._id)) return res.status(403).json({ message: "You can only mark your own teacher attendance" });
    } else if (personType === "Student") {
      const batchNames = (me.batchIds || []).map((b) => b.name);
      if (!batchNames.length || !person || !batchNames.includes(person.batch || "")) return res.status(403).json({ message: "You can only mark attendance for students in your assigned batches" });
    }
  }

  const minutesNow = localMinutesNow(now);
  const status = minutesNow < LATE_AFTER_MIN ? "present" : "late";

  const entry = await Attendance.create({
    personName,
    personType,
    refId: refId || undefined,
    method: method || "Manual",
    status,
    checkedInAt: now,
  });

  if (person) {
    // Keep the reason this attendance was captured (face scan / fingerprint scan)
    const entryType = method === "Face" ? "face-scan" : method === "Biometric" ? "fingerprint" : "manual";
    person.attendanceHistory.push({ date: now, status, type: entryType, note: "" });
    person.attendancePercent = recalcAttendancePercent(person.attendanceHistory);
    await person.save();
  }

  res.status(201).json(entry);
});

export const remove = asyncHandler(async (req, res) => {
  const item = await Attendance.findByIdAndDelete(req.params.id);
  if (!item) return res.status(404).json({ message: "Not found" });
  res.json({ message: "Deleted", id: req.params.id });
});