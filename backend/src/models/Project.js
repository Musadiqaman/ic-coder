import mongoose from "mongoose";

const paymentEntrySchema = new mongoose.Schema(
  {
    amount: Number,
    date: { type: Date, default: Date.now },
    note: String,
    forMonth: { type: String }, // "YYYY-MM" — set only when this payment pays off a maintenance challan
    challanId: { type: mongoose.Schema.Types.ObjectId }, // set only for maintenance-challan payments; absent = general contract payment
  },
  { timestamps: { createdAt: true, updatedAt: false } } // createdAt = real moment recorded, for showing an accurate time
);

// Maintenance challans work exactly like teacher salary challans: generated
// manually with a month + amount, then paid off (fully or partially) via
// paymentHistory entries tagged with this challan's _id.
const maintenanceChallanSchema = new mongoose.Schema(
  {
    month: { type: String, required: true }, // "YYYY-MM"
    label: { type: String, default: "Maintenance" },
    amount: { type: Number, required: true },
    paidAmount: { type: Number, default: 0 },
    status: { type: String, enum: ["pending", "paid"], default: "pending" },
    generatedOn: { type: Date, default: Date.now },
    paidOn: { type: Date },
  },
  { _id: true }
);

const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    ownerName: { type: String, required: true, trim: true },
    ownerPhone: { type: String, trim: true, default: "" },
    totalCost: { type: Number, required: true, default: 0 },
    paid: { type: Number, default: 0 },
    paymentHistory: { type: [paymentEntrySchema], default: [] }, // record of client payments received (contract + maintenance)
    maintenanceChallans: { type: [maintenanceChallanSchema], default: [] },
  },
  { timestamps: true }
);

// --- Indexes ---
projectSchema.index({ "paymentHistory.date": 1 }); // Dashboard cash-in date-range filtering

export default mongoose.model("Project", projectSchema);
