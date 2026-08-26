import mongoose from "mongoose";

const paymentEntrySchema = new mongoose.Schema(
  {
    amount: Number,
    date: { type: Date, default: Date.now }, // the real-world DAY the payment was made (user-picked, no time component)
    note: String,
    forMonth: { type: String }, // "YYYY-MM" — which salary challan this payment is for
    challanId: { type: mongoose.Schema.Types.ObjectId }, // REQUIRED: which challan this payment pays off
  },
  { timestamps: { createdAt: true, updatedAt: false } } // createdAt = real moment this payment was recorded, for showing an accurate time (date above is calendar-day only)
);

// challanSchema does NOT need createdAt — generatedOn/paidOn are already set
// via new Date() directly in employeesController.js (real timestamps, never
// a user-picked date-only string), so there's no accuracy gap here.
const challanSchema = new mongoose.Schema(
  {
    month: { type: String, required: true }, // "YYYY-MM"
    label: { type: String, default: "Salary" }, // "Salary", "Advance", etc.
    amount: { type: Number, required: true },
    paidAmount: { type: Number, default: 0 }, // kitna paid ho chuka hai is challan ke against (partial payments)
    status: { type: String, enum: ["pending", "paid"], default: "pending" },
    generatedOn: { type: Date, default: Date.now },
    paidOn: { type: Date },
  },
  { _id: true }
);

const employeeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    specialization: { type: String, required: true },
    salary: { type: Number, required: true, default: 0 },
    joiningDate: { type: Date, required: true },
    active: { type: Boolean, default: true },
    paymentHistory: { type: [paymentEntrySchema], default: [] },
    challans: { type: [challanSchema], default: [] },
  },
  { timestamps: true }
);

// --- Indexes ---
employeeSchema.index({ active: 1 });
employeeSchema.index({ joiningDate: -1 });
employeeSchema.index({ "paymentHistory.date": 1 }); // Dashboard cash-out date-range filtering

export default mongoose.model("Employee", employeeSchema);