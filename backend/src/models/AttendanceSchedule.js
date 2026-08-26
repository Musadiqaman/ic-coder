import mongoose from "mongoose";

const holidaySchema = new mongoose.Schema(
  {
    date: { type: String, required: true }, // "YYYY-MM-DD"
    label: { type: String, default: "Holiday" },
  },
  { _id: true }
);

// Schedule for both Students and Teachers.
// For Students: courseType is set (workspace / paid / free), personType = "Student"
// For Teachers: courseType is null, personType = "Teacher"
// Admin sets which weekdays are always off (0=Sunday ... 6=Saturday) plus any
// specific one-off holiday dates. Used by runAutoAttendance() to decide
// for each student/teacher whether a missed day should be "leave" or "absent".
const attendanceScheduleSchema = new mongoose.Schema(
  {
    courseType: { type: String, enum: ["workspace", "paid", "free"], default: null },
    personType: { type: String, enum: ["Student", "Teacher"], default: "Student" },
    weeklyOffDays: { type: [Number], default: [] },
    holidays: { type: [holidaySchema], default: [] },
  },
  { timestamps: true }
);

// Composite unique index: courseType + personType
attendanceScheduleSchema.index({ courseType: 1, personType: 1 }, { unique: true });

export default mongoose.model("AttendanceSchedule", attendanceScheduleSchema);