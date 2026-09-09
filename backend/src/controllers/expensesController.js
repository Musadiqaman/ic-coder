import Expense from "../models/Expense.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// GET /api/expenses
export const list = asyncHandler(async (req, res) => {
  const expenses = await Expense.find().sort({ createdAt: -1 });
  res.json(expenses);
});

// GET /api/expenses/:id
export const getOne = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id);
  if (!expense) return res.status(404).json({ message: "Not found" });
  res.json(expense);
});

// POST /api/expenses
export const create = asyncHandler(async (req, res) => {
  const expense = await Expense.create(req.body);
  res.status(201).json(expense);
});

// PUT /api/expenses/:id
export const update = asyncHandler(async (req, res) => {
  const expense = await Expense.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!expense) return res.status(404).json({ message: "Not found" });
  res.json(expense);
});

// DELETE /api/expenses/:id
export const remove = asyncHandler(async (req, res) => {
  const expense = await Expense.findByIdAndDelete(req.params.id);
  if (!expense) return res.status(404).json({ message: "Not found" });
  res.json({ message: "Deleted", id: req.params.id });
});
