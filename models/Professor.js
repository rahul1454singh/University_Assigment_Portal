const mongoose = require("mongoose");

const ProfessorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: String,
  password: { type: String, required: true },
  department: { type: mongoose.Schema.Types.ObjectId, ref: "Department" }
});

module.exports = mongoose.model("Professor", ProfessorSchema);
