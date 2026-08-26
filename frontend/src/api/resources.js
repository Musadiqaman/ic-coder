import { api, resourceClient } from "./client.js";

export const authApi = {
  login: (body) => api.post("/auth/login", body),
  logout: () => api.post("/auth/logout"),
  me: () => api.get("/auth/me"),
  register: (body) => api.post("/auth/register", body),
};

export const studentsApi = {
  ...resourceClient("students"),
  recognition: () => api.get("/students/recognition"),
  addPayment: (id, body) => api.post(`/students/${id}/payments`, body),
  removePayment: (id, paymentId) => api.del(`/students/${id}/payments/${paymentId}`),
  removeChallan: (id, challanId) => api.del(`/students/${id}/challans/${challanId}`),
  addChallan: (id, body) => api.post(`/students/${id}/challans`, body),
  markAttendance: (id, body) => api.post(`/students/${id}/attendance`, body),
  runAutoAttendance: (date) => api.post(`/students/run-auto-attendance`, date ? { date } : {}),
};

export const attendanceScheduleApi = {
  listAll: async () => { const r = await api.get(`/attendance-schedule`); return Array.isArray(r) ? r : (r?.students || []); },
  get: (courseType) => api.get(`/attendance-schedule/${courseType}`),
  update: (courseType, body) => api.put(`/attendance-schedule/${courseType}`, body),
  addHoliday: (courseType, body) => api.post(`/attendance-schedule/${courseType}/holidays`, body),
  removeHoliday: (courseType, holidayId) => api.del(`/attendance-schedule/${courseType}/holidays/${holidayId}`),
};

export const employeesApi = {
  ...resourceClient("employees"),
  generateChallan: (id, body) => api.post(`/employees/${id}/challans`, body),
  deleteChallan: (id, challanId) => api.del(`/employees/${id}/challans/${challanId}`),
  addPayment: (id, body) => api.post(`/employees/${id}/payments`, body),
  removePayment: (id, paymentId) => api.del(`/employees/${id}/payments/${paymentId}`),
};

export const teachersApi = {
  ...resourceClient("teachers"),
  recognition: () => api.get("/teachers/recognition"),
  me: () => api.get("/teachers/me"),
  meAttendance: () => api.get("/teachers/me/attendance"),
  markMeAttendance: (body) => api.post("/teachers/me/attendance", body),
  generateChallan: (id, body) => api.post(`/teachers/${id}/challans`, body),
  deleteChallan: (id, challanId) => api.del(`/teachers/${id}/challans/${challanId}`),
  addPayment: (id, body) => api.post(`/teachers/${id}/payments`, body),
  removePayment: (id, paymentId) => api.del(`/teachers/${id}/payments/${paymentId}`),
  // Attendance management
  getAttendanceHistory: (id) => api.get(`/teachers/${id}/attendance`),
  markManualAttendance: (id, body) => api.post(`/teachers/${id}/attendance/manual`, body),
  // Leave management
  addLeave: (id, body) => api.post(`/teachers/${id}/leave`, body),
  removeLeave: (id, leaveId) => api.del(`/teachers/${id}/leave/${leaveId}`),
};

export const settingsApi = {
  listAdmins: () => api.get("/settings/admins"),
  changePassword: (body) => api.post("/settings/change-password", body),
};

export const expensesApi = resourceClient("expenses");

export const projectsApi = {
  ...resourceClient("projects"),
  addPayment: (id, body) => api.post(`/projects/${id}/payments`, body),
  removePayment: (id, paymentId) => api.del(`/projects/${id}/payments/${paymentId}`),
  generateChallan: (id, body) => api.post(`/projects/${id}/maintenance-challans`, body),
  deleteChallan: (id, challanId) => api.del(`/projects/${id}/maintenance-challans/${challanId}`),
};

export const loansApi = {
  ...resourceClient("loans"),
  addPayment: (id, body) => api.post(`/loans/${id}/payments`, body),
  removePayment: (id, paymentId) => api.del(`/loans/${id}/payments/${paymentId}`),
};

export const dashboardApi = {
  // params: { filter: "today" | "thisMonth" | "lastMonth" | "all" | "custom",
  //           startDate?: "YYYY-MM-DD", endDate?: "YYYY-MM-DD" }
  summary: (params = {}, signal) => {
    const query = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""))
    ).toString();
    return api.get(`/dashboard/summary${query ? `?${query}` : ""}`, signal ? { signal } : undefined);
  },
};

export const attendanceApi = {
  list: (date) => api.get(`/attendance${date ? `?date=${date}` : ""}`),
  checkIn: (payload) => api.post("/attendance/checkin", payload),
  remove: (id) => api.del(`/attendance/${id}`),
};

export const batchesApi = {
  ...resourceClient("batches"),
};