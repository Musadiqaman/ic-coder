import mongoose from "mongoose";

const batchSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      lowercase: true, // Store lowercase
    },
    description: { type: String, default: "" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Case-insensitive unique index with sparse for null safety
batchSchema.index({ name: 1 }, { 
  unique: true,
  sparse: true, // null values ko duplicate index se exclude kare
  collation: { locale: 'en', strength: 2 } 
});

export default mongoose.model("Batch", batchSchema);
