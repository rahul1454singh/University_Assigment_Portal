const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: { type: String },
  role: { type: String, enum: ["Student", "Professor", "HOD"], default: "Student" },
  department: { type: mongoose.Schema.Types.ObjectId, ref: "Department" },

  //  password reset
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date }
});

module.exports = mongoose.models.UserData || mongoose.model("UserData", userSchema);
