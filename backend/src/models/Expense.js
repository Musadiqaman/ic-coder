import mongoose from "mongoose";

const expenseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    amount: { type: Number, required: true },
    description: { type: String, default: "" },
    date: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);

// --- Indexes ---
expenseSchema.index({ date: -1 }); // Dashboard/reporting date-range filtering + newest-first listing

export default mongoose.model("Expense", expenseSchema);
