import User from "../models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { audit } from "../utils/audit.js";

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  const userId = req.user.id;

  if (!currentPassword || !newPassword || !confirmPassword) return res.status(400).json({ message: "All fields are required" });
  if (typeof currentPassword !== "string" || typeof newPassword !== "string" || typeof confirmPassword !== "string") return res.status(400).json({ message: "Passwords must be text values" });
  if (newPassword !== confirmPassword) return res.status(400).json({ message: "New password and confirm password do not match" });
  if (newPassword.length < 8 || newPassword.length > 128) return res.status(400).json({ message: "Password must be 8-128 characters" });
  if (newPassword === currentPassword) return res.status(400).json({ message: "New password must be different from the current password" });

  const user = await User.findById(userId).select("+password");
  if (!user) return res.status(404).json({ message: "User not found" });
  if (!(await user.comparePassword(currentPassword))) return res.status(400).json({ message: "Current password is incorrect" });

  user.password = newPassword;
  user.sessionVersion = (user.sessionVersion || 0) + 1;
  await user.save();
  await audit(req, "auth.password_changed", { userId: String(user._id) });

  res.clearCookie("token", { httpOnly: true, sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  res.json({ message: "Password changed successfully. Please log in again." });
});


export const listAdmins = asyncHandler(async (req, res) => {
  const admins = await User.find({ role: "admin" })
    .select("name email role createdAt updatedAt")
    .sort({ createdAt: 1 })
    .lean();

  res.json(admins.map((admin) => ({
    id: String(admin._id),
    name: admin.name,
    email: admin.email,
    role: admin.role,
    createdAt: admin.createdAt,
  })));
});
