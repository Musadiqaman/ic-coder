import Employee from "../models/Employee.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// ── Helper Functions ──────────────────────────────────────────────────────

// Recompute salary status: pending if ANY challan is unpaid, paid if all cleared
function recomputeSalaryStatus(employee) {
  const hasPending = employee.challans.some((c) => c.status !== "paid");
  employee.paymentStatus = hasPending ? "due" : employee.challans.length ? "paid" : "n/a";
}

// Mark each challan paid/pending based ONLY on payments tagged with that challan's _id
function reconcileChallan(employee) {
  employee.challans.forEach((c) => {
    const paidForChallan = employee.paymentHistory
      .filter((p) => p.challanId && String(p.challanId) === String(c._id))
      .reduce((s, p) => s + p.amount, 0);

    if (paidForChallan >= c.amount) {
      c.status = "paid";
      if (!c.paidOn) c.paidOn = new Date();
      c.paidAmount = c.amount;
    } else {
      c.status = "pending";
      c.paidOn = undefined;
      c.paidAmount = paidForChallan;
    }
  });
}

// ── CRUD Operations ──────────────────────────────────────────────────────

// GET /api/employees
export const list = asyncHandler(async (req, res) => {
  const employees = await Employee.find().sort({ createdAt: -1 });
  res.json(employees);
});

// GET /api/employees/:id
export const getOne = asyncHandler(async (req, res) => {
  const employee = await Employee.findById(req.params.id);
  if (!employee) return res.status(404).json({ message: "Not found" });
  res.json(employee);
});

// POST /api/employees
// Creates employee without any initial challans. Employee must be registered first.
export const create = asyncHandler(async (req, res) => {
  // Ensure active defaults to true if not provided
  if (req.body.active === undefined) {
    req.body.active = true;
  }
  const employee = await Employee.create(req.body);
  res.status(201).json(employee);
});

// PUT /api/employees/:id
export const update = asyncHandler(async (req, res) => {
  const employee = await Employee.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!employee) return res.status(404).json({ message: "Not found" });
  res.json(employee);
});

// DELETE /api/employees/:id
export const remove = asyncHandler(async (req, res) => {
  const employee = await Employee.findByIdAndDelete(req.params.id);
  if (!employee) return res.status(404).json({ message: "Not found" });
  res.json({ message: "Deleted", id: req.params.id });
});

// ── Salary Challan Management ────────────────────────────────────────────

// POST /api/employees/:id/challans
// Manually generate a salary challan for a specific month
export const generateSalaryChallan = asyncHandler(async (req, res) => {
  const { month, amount, label } = req.body;

  if (!month || !amount) {
    return res.status(400).json({ message: "month and amount are required" });
  }

  const employee = await Employee.findById(req.params.id);
  if (!employee) return res.status(404).json({ message: "Employee not found" });

  // Check if challan already exists for this month
  const already = employee.challans.some((c) => c.month === month && c.label === (label || "Salary"));
  if (already) {
    return res.status(409).json({ message: `Salary challan already exists for ${month}` });
  }

  employee.challans.push({
    month,
    label: label || "Salary",
    amount: Number(amount),
    status: "pending",
  });

  recomputeSalaryStatus(employee);
  await employee.save();
  res.status(201).json(employee);
});

// DELETE /api/employees/:id/challans/:challanId
// Remove a salary challan (blocked if any payment exists against it)
export const removeChallan = asyncHandler(async (req, res) => {
  const { id, challanId } = req.params;
  const employee = await Employee.findById(id);
  if (!employee) return res.status(404).json({ message: "Employee not found" });

  const challan = employee.challans.id(challanId);
  if (!challan) return res.status(404).json({ message: "Challan not found" });

  // Check if any payment exists for this challan
  const hasPayments = employee.paymentHistory.some(
    (p) => p.challanId && String(p.challanId) === String(challanId)
  );

  if (hasPayments) {
    return res.status(400).json({
      message: "Cannot delete challan with payments. Remove payments first.",
    });
  }

  employee.challans.pull(challanId);
  recomputeSalaryStatus(employee);
  await employee.save();
  res.json(employee);
});

// ── Payment Management ──────────────────────────────────────────────────

// POST /api/employees/:id/payments
// Record a salary payment against a specific challan
export const addPayment = asyncHandler(async (req, res) => {
  const { amount, note, date, challanId } = req.body;
  const amt = Number(amount);

  if (!amt || amt <= 0) {
    return res.status(400).json({ message: "A valid payment amount is required" });
  }

  if (!challanId) {
    return res.status(400).json({ message: "Select which challan this payment is for" });
  }

  const employee = await Employee.findById(req.params.id);
  if (!employee) return res.status(404).json({ message: "Employee not found" });

  const challan = employee.challans.id(challanId);
  if (!challan) return res.status(404).json({ message: "Challan not found" });

  if (challan.status === "paid") {
    return res.status(400).json({ message: "This challan is already fully paid" });
  }

  // Calculate how much is already paid for this specific challan
  const alreadyPaid = employee.paymentHistory
    .filter((p) => p.challanId && String(p.challanId) === String(challanId))
    .reduce((s, p) => s + p.amount, 0);

  const remaining = challan.amount - alreadyPaid;

  // Cap payment to remaining balance
  if (amt > remaining) {
    return res.status(400).json({
      message: `Amount exceeds the pending balance of ₨${remaining} for this challan`,
    });
  }

  employee.paymentHistory.push({
    amount: amt,
    date: date ? new Date(date) : new Date(),
    note: note || "",
    forMonth: challan.month,
    challanId: challan._id,
  });

  reconcileChallan(employee);
  recomputeSalaryStatus(employee);

  await employee.save();
  res.status(201).json(employee);
});

// DELETE /api/employees/:id/payments/:paymentId
// Remove a single payment entry, then re-reconcile challans
export const removePayment = asyncHandler(async (req, res) => {
  const { id, paymentId } = req.params;
  const employee = await Employee.findById(id);
  if (!employee) return res.status(404).json({ message: "Employee not found" });

  employee.paymentHistory = employee.paymentHistory.filter((p) => String(p._id) !== paymentId);

  reconcileChallan(employee);
  recomputeSalaryStatus(employee);

  await employee.save();
  res.json(employee);
});