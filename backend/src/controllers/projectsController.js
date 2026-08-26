import Project from "../models/Project.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Mark each maintenance challan paid/pending based ONLY on payments tagged with that challan's _id
function reconcileMaintenanceChallan(project) {
  project.maintenanceChallans.forEach((c) => {
    const paidForChallan = project.paymentHistory
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

// GET /api/projects
export const list = asyncHandler(async (req, res) => {
  const projects = await Project.find().sort({ createdAt: -1 });
  res.json(projects);
});

// GET /api/projects/:id
export const getOne = asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id);
  if (!project) return res.status(404).json({ message: "Not found" });
  res.json(project);
});

// POST /api/projects
export const create = asyncHandler(async (req, res) => {
  const project = await Project.create(req.body);
  res.status(201).json(project);
});

// PUT /api/projects/:id
export const update = asyncHandler(async (req, res) => {
  const project = await Project.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!project) return res.status(404).json({ message: "Not found" });
  res.json(project);
});

// DELETE /api/projects/:id
export const remove = asyncHandler(async (req, res) => {
  const project = await Project.findByIdAndDelete(req.params.id);
  if (!project) return res.status(404).json({ message: "Not found" });
  res.json({ message: "Deleted", id: req.params.id });
});

// POST /api/projects/:id/payments
// Record a client payment received. If challanId is given, the payment pays
// off a maintenance challan; otherwise it's a general payment against the
// project's totalCost.
export const addPayment = asyncHandler(async (req, res) => {
  const { amount, note, date, challanId } = req.body;
  const amt = Number(amount);
  if (!amt || amt <= 0) {
    return res.status(400).json({ message: "A valid payment amount is required" });
  }

  const project = await Project.findById(req.params.id);
  if (!project) return res.status(404).json({ message: "Not found" });

  if (challanId) {
    const challan = project.maintenanceChallans.id(challanId);
    if (!challan) return res.status(404).json({ message: "Maintenance challan not found" });
    if (challan.status === "paid") {
      return res.status(400).json({ message: "This challan is already fully paid" });
    }

    const alreadyPaid = project.paymentHistory
      .filter((p) => p.challanId && String(p.challanId) === String(challanId))
      .reduce((s, p) => s + p.amount, 0);
    const remaining = challan.amount - alreadyPaid;

    if (amt > remaining) {
      return res.status(400).json({
        message: `Amount exceeds the pending balance of ₨${remaining} for this challan`,
      });
    }

    project.paymentHistory.push({
      amount: amt,
      date: date ? new Date(date) : new Date(),
      note: note || "",
      forMonth: challan.month,
      challanId: challan._id,
    });
    reconcileMaintenanceChallan(project);
  } else {
    project.paymentHistory.push({ amount: amt, date: date ? new Date(date) : new Date(), note: note || "" });
    project.paid = Math.min(project.totalCost, project.paid + amt);
  }

  await project.save();
  res.status(201).json(project);
});

// DELETE /api/projects/:id/payments/:paymentId
export const removePayment = asyncHandler(async (req, res) => {
  const { id, paymentId } = req.params;
  const project = await Project.findById(id);
  if (!project) return res.status(404).json({ message: "Not found" });

  const entry = project.paymentHistory.find((p) => String(p._id) === paymentId);
  if (!entry) return res.status(404).json({ message: "Payment not found" });

  project.paymentHistory = project.paymentHistory.filter((p) => String(p._id) !== paymentId);

  if (entry.challanId) {
    reconcileMaintenanceChallan(project);
  } else {
    project.paid = Math.max(0, project.paid - entry.amount);
  }

  await project.save();
  res.json(project);
});

// ── Maintenance Challan Management ───────────────────────────────────────

// POST /api/projects/:id/maintenance-challans
// Manually generate a maintenance challan for a specific month
export const generateMaintenanceChallan = asyncHandler(async (req, res) => {
  const { month, amount, label } = req.body;

  if (!month || !amount) {
    return res.status(400).json({ message: "month and amount are required" });
  }

  const project = await Project.findById(req.params.id);
  if (!project) return res.status(404).json({ message: "Project not found" });

  const already = project.maintenanceChallans.some((c) => c.month === month && c.label === (label || "Maintenance"));
  if (already) {
    return res.status(409).json({ message: `Maintenance challan already exists for ${month}` });
  }

  project.maintenanceChallans.push({
    month,
    label: label || "Maintenance",
    amount: Number(amount),
    status: "pending",
  });

  await project.save();
  res.status(201).json(project);
});

// DELETE /api/projects/:id/maintenance-challans/:challanId
// Remove a maintenance challan (blocked if any payment exists against it)
export const removeMaintenanceChallan = asyncHandler(async (req, res) => {
  const { id, challanId } = req.params;
  const project = await Project.findById(id);
  if (!project) return res.status(404).json({ message: "Project not found" });

  const challan = project.maintenanceChallans.id(challanId);
  if (!challan) return res.status(404).json({ message: "Challan not found" });

  const hasPayments = project.paymentHistory.some(
    (p) => p.challanId && String(p.challanId) === String(challanId)
  );

  if (hasPayments) {
    return res.status(400).json({
      message: "Cannot delete challan with payments. Remove payments first.",
    });
  }

  project.maintenanceChallans.pull(challanId);
  await project.save();
  res.json(project);
});
