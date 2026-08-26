import mongoose from "mongoose";

const paymentEntrySchema = new mongoose.Schema(
  { amount: Number, date: { type: Date, default: Date.now }, note: String },
  { timestamps: { createdAt: true, updatedAt: false } } // createdAt = real moment recorded, for showing an accurate time
);

const loanSchema = new mongoose.Schema(
  {
    from: { type: String, required: true, trim: true }, // person or company name
    kind: { type: String, enum: ["person", "company"], required: true },
    amount: { type: Number, required: true }, // total taken
    left: { type: Number, required: true, default: 0 }, // remaining
    contact: { type: String, trim: true }, // phone or contact number
    paymentHistory: { type: [paymentEntrySchema], default: [] }, // record of amounts paid back
  },
  { timestamps: true }
);

// status is derived, not stored, so it never goes stale relative to amount/left
loanSchema.virtual("status").get(function () {
  if (this.left <= 0) return "paid";
  if (this.left < this.amount) return "partial";
  return "unpaid";
});
loanSchema.set("toJSON", { virtuals: true });

// --- Indexes ---
loanSchema.index({ createdAt: -1 }); // "loans taken" date-range filtering on Dashboard
loanSchema.index({ "paymentHistory.date": 1 }); // "loan return" date-range filtering on Dashboard

export default mongoose.model("Loan", loanSchema);