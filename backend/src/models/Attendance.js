import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema(
  {
    personName: { type: String, required: true },
    personType: { type: String, enum: ["Student", "Employee", "Teacher"], required: true },
    refId: { type: mongoose.Schema.Types.ObjectId, refPath: "personType" },
    method: { type: String, enum: ["Face", "Biometric", "Manual"], default: "Manual" },
    status: { type: String, enum: ["present", "late", "absent"], default: "present" },
    checkedInAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// --- Indexes ---
attendanceSchema.index({ refId: 1, checkedInAt: -1 }); // "this person's attendance history" lookups
attendanceSchema.index({ checkedInAt: -1 }); // date-range / newest-first listing
attendanceSchema.index({ personType: 1 });

export default mongoose.model("Attendance", attendanceSchema);
