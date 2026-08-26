import Loan from "../models/Loan.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// GET /api/loans
export const list = asyncHandler(async (req, res) => {
  const loans = await Loan.find().sort({ createdAt: -1 });
  res.json(loans);
});

// GET /api/loans/:id
export const getOne = asyncHandler(async (req, res) => {
  const loan = await Loan.findById(req.params.id);
  if (!loan) return res.status(404).json({ message: "Not found" });
  res.json(loan);
});

// POST /api/loans
export const create = asyncHandler(async (req, res) => {
  const loan = await Loan.create(req.body);
  res.status(201).json(loan);
});

// PUT /api/loans/:id
export const update = asyncHandler(async (req, res) => {
  const loan = await Loan.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!loan) return res.status(404).json({ message: "Not found" });
  res.json(loan);
});

// DELETE /api/loans/:id
export const remove = asyncHandler(async (req, res) => {
  const loan = await Loan.findByIdAndDelete(req.params.id);
  if (!loan) return res.status(404).json({ message: "Not found" });
  res.json({ message: "Deleted", id: req.params.id });
});

// POST /api/loans/:id/payments
// Record a repayment towards the loan: adds a history entry and reduces the remaining balance.
export const addPayment = asyncHandler(async (req, res) => {
  const { amount, note, date } = req.body;
  const amt = Number(amount);
  if (!amt || amt <= 0) {
    return res.status(400).json({ message: "A valid payment amount is required" });
  }

  const loan = await Loan.findById(req.params.id);
  if (!loan) return res.status(404).json({ message: "Not found" });

  // Validate payment doesn't exceed outstanding amount
  if (amt > loan.left) {
    return res.status(400).json({ message: `Payment amount cannot exceed outstanding balance of ₨${loan.left}` });
  }

  loan.paymentHistory.push({ amount: amt, date: date ? new Date(date) : new Date(), note: note || "" });
  loan.left = Math.max(0, loan.left - amt);

  await loan.save();
  res.status(201).json(loan);
});

// DELETE /api/loans/:id/payments/:paymentId
// Remove a repayment entry (e.g. entered by mistake) and restore it to the remaining balance.
export const removePayment = asyncHandler(async (req, res) => {
  const { id, paymentId } = req.params;
  const loan = await Loan.findById(id);
  if (!loan) return res.status(404).json({ message: "Not found" });

  const entry = loan.paymentHistory.find((p) => String(p._id) === paymentId);
  if (!entry) return res.status(404).json({ message: "Payment not found" });

  loan.paymentHistory = loan.paymentHistory.filter((p) => String(p._id) !== paymentId);
  loan.left = Math.min(loan.amount, loan.left + entry.amount);

  await loan.save();
  res.json(loan);
});
