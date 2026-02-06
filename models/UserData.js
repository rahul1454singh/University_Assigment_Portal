const mongoose = require("mongoose");
const bcrypt = require("bcryptjs"); // Make sure this is at the top

const UserDataSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: { type: String },
  department: { type: mongoose.Schema.Types.ObjectId, ref: "Department" },
  role: { 
    type: String, 
    enum: ["student", "professor", "hod"], 
    lowercase: true, 
    default: "student" 
  },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

// THIS IS THE FIX: Automatically hash password before saving to DB
UserDataSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model("UserData", UserDataSchema);