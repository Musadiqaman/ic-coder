import mongoose from "mongoose";

const rateLimitSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    windowStart: { type: Number, required: true },
    count: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false }
);

rateLimitSchema.index({ key: 1, windowStart: 1 }, { unique: true });
rateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("RateLimit", rateLimitSchema);
