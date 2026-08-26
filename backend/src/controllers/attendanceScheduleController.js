import AttendanceSchedule from "../models/AttendanceSchedule.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const COURSE_TYPES = ["workspace", "paid", "free"];
const PERSON_TYPES = ["Student", "Teacher"];

// GET /api/attendance-schedule/:courseType
// OR /api/attendance-schedule/teacher (for teacher schedule)
export const getSchedule = asyncHandler(async (req, res) => {
  const { courseType } = req.params;
  
  // Handle teacher schedule request
  if (courseType === "teacher") {
    let schedule = await AttendanceSchedule.findOne({ personType: "Teacher" });
    if (!schedule) {
      schedule = { personType: "Teacher", weeklyOffDays: [], holidays: [] };
    }
    return res.json(schedule);
  }

  if (!COURSE_TYPES.includes(courseType)) {
    return res.status(400).json({ message: "Invalid course type" });
  }
  let schedule = await AttendanceSchedule.findOne({ courseType, personType: "Student" });
  if (!schedule) {
    schedule = { courseType, personType: "Student", weeklyOffDays: [], holidays: [] };
  }
  res.json(schedule);
});

// GET /api/attendance-schedule  (all schedules, for the settings screen)
export const getAllSchedules = asyncHandler(async (req, res) => {
  const schedules = await AttendanceSchedule.find();
  
  // Group by courseType and personType
  const studentSchedules = COURSE_TYPES.map((ct) => 
    schedules.find(s => s.courseType === ct && s.personType === "Student") || 
    { courseType: ct, personType: "Student", weeklyOffDays: [], holidays: [] }
  );
  
  const teacherSchedule = schedules.find(s => s.personType === "Teacher") || 
    { personType: "Teacher", weeklyOffDays: [], holidays: [] };
  
  res.json({
    students: studentSchedules,
    teacher: teacherSchedule
  });
});

// PUT /api/attendance-schedule/:courseType
// Body: { weeklyOffDays: [0-6], holidays: [{ date, label }] }
// OR PUT /api/attendance-schedule/teacher
export const updateSchedule = asyncHandler(async (req, res) => {
  const { courseType } = req.params;
  const { weeklyOffDays, holidays } = req.body;

  // Handle teacher schedule update
  if (courseType === "teacher") {
    const schedule = await AttendanceSchedule.findOneAndUpdate(
      { personType: "Teacher" },
      {
        personType: "Teacher",
        weeklyOffDays: Array.isArray(weeklyOffDays) ? weeklyOffDays.filter((d) => d >= 0 && d <= 6) : [],
        holidays: Array.isArray(holidays) ? holidays.filter((h) => h.date) : [],
      },
      { new: true, upsert: true, runValidators: true }
    );
    return res.json(schedule);
  }

  if (!COURSE_TYPES.includes(courseType)) {
    return res.status(400).json({ message: "Invalid course type" });
  }

  const schedule = await AttendanceSchedule.findOneAndUpdate(
    { courseType, personType: "Student" },
    {
      courseType,
      personType: "Student",
      weeklyOffDays: Array.isArray(weeklyOffDays) ? weeklyOffDays.filter((d) => d >= 0 && d <= 6) : [],
      holidays: Array.isArray(holidays) ? holidays.filter((h) => h.date) : [],
    },
    { new: true, upsert: true, runValidators: true }
  );
  res.json(schedule);
});

// POST /api/attendance-schedule/:courseType/holidays
// Body: { date, label }
// OR POST /api/attendance-schedule/teacher/holidays
export const addHoliday = asyncHandler(async (req, res) => {
  const { courseType } = req.params;
  const { date, label } = req.body;
  if (!date) {
    return res.status(400).json({ message: "Holiday date is required" });
  }

  // Handle teacher schedule
  if (courseType === "teacher") {
    const schedule = await AttendanceSchedule.findOneAndUpdate(
      { personType: "Teacher" },
      {
        $push: { holidays: { date, label: label || "Holiday" } },
        $setOnInsert: { personType: "Teacher" },
      },
      { new: true, upsert: true, runValidators: true }
    );
    return res.json(schedule);
  }

  if (!COURSE_TYPES.includes(courseType)) {
    return res.status(400).json({ message: "Invalid course type" });
  }

  const schedule = await AttendanceSchedule.findOneAndUpdate(
    { courseType, personType: "Student" },
    {
      $push: { holidays: { date, label: label || "Holiday" } },
      $setOnInsert: { courseType, personType: "Student" },
    },
    { new: true, upsert: true, runValidators: true }
  );
  res.json(schedule);
});

// DELETE /api/attendance-schedule/:courseType/holidays/:holidayId
// OR DELETE /api/attendance-schedule/teacher/holidays/:holidayId
export const deleteHoliday = asyncHandler(async (req, res) => {
  const { courseType, holidayId } = req.params;

  // Handle teacher schedule
  if (courseType === "teacher") {
    const schedule = await AttendanceSchedule.findOneAndUpdate(
      { personType: "Teacher" },
      { $pull: { holidays: { _id: holidayId } } },
      { new: true }
    );

    if (!schedule) {
      return res.status(404).json({ message: "Schedule not found" });
    }
    return res.json(schedule);
  }

  if (!COURSE_TYPES.includes(courseType)) {
    return res.status(400).json({ message: "Invalid course type" });
  }

  const schedule = await AttendanceSchedule.findOneAndUpdate(
    { courseType, personType: "Student" },
    { $pull: { holidays: { _id: holidayId } } },
    { new: true }
  );

  if (!schedule) {
    return res.status(404).json({ message: "Schedule not found" });
  }
  res.json(schedule);
});