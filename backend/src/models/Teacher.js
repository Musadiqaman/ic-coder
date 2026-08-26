import mongoose from "mongoose";

const paymentEntrySchema = new mongoose.Schema(
  {
    amount: Number,
    date: { type: Date, default: Date.now }, // the real-world DAY the payment was made (user-picked, no time component)
    note: String,
    forMonth: { type: String }, // "YYYY-MM" — which salary challan this payment is for
    challanId: { type: mongoose.Schema.Types.ObjectId }, // REQUIRED: which challan this payment pays off
  },
  { timestamps: { createdAt: true, updatedAt: false } } // createdAt = real moment this payment was recorded, for showing an accurate time (date above is calendar-day only)
);

const attendanceEntrySchema = new mongoose.Schema(
  {
    date: { type: Date, default: Date.now }, // the calendar DAY this attendance is for
    status: { type: String, enum: ["present", "late", "absent", "leave"], default: "present" },
    note: String,
    type: { type: String, enum: ["manual", "face-scan", "fingerprint", "auto"], default: "manual" }, // how this record was captured
  },
  { _id: false, timestamps: { createdAt: true, updatedAt: false } }
);

const leaveEntrySchema = new mongoose.Schema(
  {
    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },
    reason: { type: String, default: "Leave" },
  },
  { _id: true, timestamps: { createdAt: true, updatedAt: false } }
);

// challanSchema does NOT need createdAt — generatedOn/paidOn are already set
// via new Date() directly in teachersController.js (real timestamps, never
// a user-picked date-only string), so there's no accuracy gap here.
const challanSchema = new mongoose.Schema(
  {
    month: { type: String, required: true }, // "YYYY-MM"
    label: { type: String, default: "Salary" }, // "Salary", "Advance", etc.
    amount: { type: Number, required: true },
    paidAmount: { type: Number, default: 0 }, // kitna paid ho chuka hai is challan ke against (partial payments)
    status: { type: String, enum: ["pending", "paid"], default: "pending" },
    generatedOn: { type: Date, default: Date.now },
    paidOn: { type: Date },
  },
  { _id: true }
);

const teacherSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", unique: true, sparse: true },
    batchIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Batch" }],
    name: { type: String, required: true, trim: true },
    specialization: { type: String, required: true },
    salary: { type: Number, required: true, default: 0 },
    joiningDate: { type: Date, required: true },
    active: { type: Boolean, default: true },
    paymentHistory: { type: [paymentEntrySchema], default: [] },
    challans: { type: [challanSchema], default: [] },
    // NEW: Attendance & Leave Management
    faceDescriptor: { type: [Number], default: undefined }, // used for face-attendance matching
    fingerprintId: { type: String, default: undefined, trim: true }, // device-assigned fingerprint template ID
    attendanceHistory: { type: [attendanceEntrySchema], default: [] },
    leaveHistory: { type: [leaveEntrySchema], default: [] },
    attendancePercent: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// --- Indexes ---
teacherSchema.index({ active: 1 });
teacherSchema.index({ batchIds: 1 });
teacherSchema.index({ joiningDate: -1 });
teacherSchema.index({ "paymentHistory.date": 1 }); // Dashboard cash-out date-range filtering
teacherSchema.index({ "attendanceHistory.date": 1 }); // Attendance page date lookups
teacherSchema.index(
  { fingerprintId: 1 },
  { unique: true, sparse: true } // sparse: only enforced for teachers that actually have a fingerprintId enrolled
);

export default mongoose.model("Teacher", teacherSchema);