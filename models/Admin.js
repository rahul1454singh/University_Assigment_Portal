const mongoose = require("mongoose");
const bcrypt = require("bcryptjs"); // Added this line

const adminSchema = new mongoose.Schema({
  name: { type: String, default: "Admin" },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: "admin" },
  // Adding these to match your OTP logic in the routes
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date }
});

/**
 * 🔐 AUTO-HASH PASSWORD BEFORE SAVING
 * This ensures that when you reset an Admin password, it gets encrypted
 * so that bcrypt.compare can read it during login.
 */
adminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.models.Admin || mongoose.model("Admin", adminSchema);