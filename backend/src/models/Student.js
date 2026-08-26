import mongoose from "mongoose";

const paymentEntrySchema = new mongoose.Schema(
  {
    amount: Number,
    date: { type: Date, default: Date.now }, // the real-world DAY the money was received (user-picked, no time component)
    note: String,
    forMonth: { type: String }, // "YYYY-MM" — kept for display/reporting, derived from the challan
    challanId: { type: mongoose.Schema.Types.ObjectId }, // REQUIRED going forward: which challan this payment pays off
  },
  { timestamps: { createdAt: true, updatedAt: false } } // createdAt = real moment this payment was recorded, for showing an accurate time (date above is calendar-day only)
);

const attendanceEntrySchema = new mongoose.Schema(
  {
    date: { type: Date, default: Date.now }, // the calendar DAY this attendance is for (may be backdated by auto-attendance/manual entry — not a precise time)
    status: { type: String, enum: ["present", "late", "absent", "leave"], default: "present" },
    note: String,
    type: { type: String, enum: ["manual", "face-scan", "fingerprint", "auto"], default: "manual" }, // how this record was captured
  },
  { _id: false, timestamps: { createdAt: true, updatedAt: false } } // createdAt = real moment this was recorded (e.g. actual face-scan time), independent of the calendar "date" above
);

const challanSchema = new mongoose.Schema(
  {
    month: { type: String, required: true }, // "YYYY-MM"
    label: { type: String, default: "Monthly Fee" }, // "Registration Fee" for the one-time entry
    amount: { type: Number, required: true },
    paidAmount: { type: Number, default: 0 }, // kitna paid ho chuka hai is challan ke against (partial payments track karne ke liye)
    status: { type: String, enum: ["pending", "paid"], default: "pending" },
    generatedOn: { type: Date, default: Date.now },
    paidOn: { type: Date },
  },
  { _id: true }
);

const studentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true, // enforced at the DB level; controller also does a friendlier pre-check
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      unique: true, // enforced at the DB level; controller also does a friendlier pre-check
    },
    courseType: { type: String, enum: ["workspace", "free", "paid"], required: true },
    courseName: { type: String, required: true },
    duration: { type: String, default: "" },
    batch: { type: String, default: "", trim: true }, // e.g. "Batch 2026-A" — groups students for the Dashboard batch chart
    joiningDate: { type: Date, required: true },
    registrationFee: { type: Number, default: 0 },
    monthlyFee: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    attendancePercent: { type: Number, default: 0 },
    attendanceHistory: { type: [attendanceEntrySchema], default: [] },
    paymentStatus: { type: String, enum: ["paid", "due", "n/a"], default: "n/a" },
    paymentHistory: { type: [paymentEntrySchema], default: [] },
    challans: { type: [challanSchema], default: [] },
    certificateIssued: { type: Boolean, default: false },
    studentPic: { type: String, default: "" },
    timing: { type: String, default: "9 AM – 5 PM · Mon–Fri" },
    faceDescriptor: { type: [Number], default: undefined }, // used for face-attendance + duplicate-face detection
    fingerprintId: { type: String, default: undefined, trim: true }, // device-assigned fingerprint template ID, used for fingerprint-attendance matching
  },
  { timestamps: true }
);

// --- Indexes ---
// email/phone already get unique indexes automatically from `unique: true` above.
// These extra ones speed up the queries this app actually runs a lot:
studentSchema.index({ courseType: 1 }); // Students page course-type filter + Dashboard student-mix count
studentSchema.index({ active: 1 }); // used by auto-attendance / active-only listings
studentSchema.index({ paymentStatus: 1 }); // "due" students lookups
studentSchema.index({ joiningDate: -1 }); // newest-first sorting / range queries
studentSchema.index({ createdAt: -1 }); // fast newest-first Students list
studentSchema.index({ batch: 1, active: 1, createdAt: -1 }); // teacher-scoped Students list
studentSchema.index({ "paymentHistory.date": 1 }); // Dashboard cash-in-hand date-range filtering
studentSchema.index({ "attendanceHistory.date": 1 }); // Attendance page date lookups
studentSchema.index({ batch: 1 }); // Batches breakdown on Dashboard + Students page batch filter
studentSchema.index(
  { fingerprintId: 1 },
  { unique: true, sparse: true } // sparse: only enforced for students that actually have a fingerprintId enrolled
);

export default mongoose.model("Student", studentSchema);

/*
MIGRATION NOTE (important):
If you already have students in the DB with duplicate/blank emails or phones,
adding `unique: true` will fail to build the index (or silently not enforce it
until you fix the data). Before deploying this:

  1. Find duplicates:
     db.students.aggregate([
       { $group: { _id: "$email", count: { $sum: 1 } } },
       { $match: { count: { $gt: 1 } } }
     ])
     (repeat for "$phone")

  2. Fix/merge those records manually.

  3. If old indexes exist without uniqueness, drop and let Mongoose rebuild:
     db.students.dropIndex("email_1")
     db.students.dropIndex("phone_1")
     (Mongoose will recreate them as unique on next app start.)

NOTE ON createdAt BACKFILL:
paymentEntrySchema and attendanceEntrySchema now have `createdAt`. The first
time an existing student document gets saved after this change, Mongoose will
backfill createdAt on every entry that's missing it — using the CURRENT save
time, not the entry's real original time (which was never captured before).
Only entries created AFTER this schema change will have an accurate
createdAt. This is expected — same as what happened with Loan.js.
*/