import Batch from "../models/Batch.js";
import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// GET /api/batches
export const list = asyncHandler(async (req, res) => {
  const batches = await Batch.find({ active: true }).sort({ name: 1 });
  res.json(batches);
});

// POST /api/batches
export const create = asyncHandler(async (req, res) => {
  const { name, description } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ message: "Batch name is required" });
  }

  // Check duplicate (case-insensitive)
  const existing = await Batch.findOne({ name: name.trim().toLowerCase() });
  if (existing) {
    return res.status(409).json({ message: `Batch "${existing.name}" already exists` });
  }

  const batch = await Batch.create({
    name: name.trim().toLowerCase(),
    description: description || "",
  });

  res.status(201).json(batch);
});

// PUT /api/batches/:id
export const update = asyncHandler(async (req, res) => {
  const { name, description, active } = req.body;

  if (name && !name.trim()) {
    return res.status(400).json({ message: "Batch name cannot be empty" });
  }

  const batch = await Batch.findById(req.params.id);
  if (!batch) {
    return res.status(404).json({ message: "Batch not found" });
  }

  if (name && name.trim().toLowerCase() !== batch.name) {
    const existing = await Batch.findOne({ name: name.trim().toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: `Batch "${existing.name}" already exists` });
    }
    const oldName = batch.name;
    const newName = name.trim().toLowerCase();
    batch.name = newName;
    await Student.updateMany({ batch: oldName }, { $set: { batch: newName } });
  }

  if (description !== undefined) batch.description = description;
  if (active !== undefined) batch.active = active;

  await batch.save();
  res.json(batch);
});

// DELETE /api/batches/:id
export const remove = asyncHandler(async (req, res) => {
  const batch = await Batch.findByIdAndDelete(req.params.id);
  if (!batch) {
    return res.status(404).json({ message: "Batch not found" });
  }
  await Student.updateMany({ batch: batch.name }, { $set: { batch: "" } });
  await Teacher.updateMany({ batchIds: batch._id }, { $pull: { batchIds: batch._id } });
  res.json({ message: "Batch deleted", id: req.params.id });
});
