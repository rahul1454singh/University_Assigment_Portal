const mongoose = require("mongoose");

const DepartmentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ["UG", "PG", "Research"], required: true },
  address: { type: String, required: true }
});

module.exports = mongoose.models.Department || mongoose.model("Department", DepartmentSchema);
