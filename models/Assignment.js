const mongoose = require("mongoose");

const AssignmentSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "UserData", required: true, index: true },
  status: { type: String, enum: ["Draft", "Submitted", "Approved", "Rejected"], default: "Draft" },
  category: { type: String, enum: ["Assignment", "Thesis", "Report"], default: "Assignment", required: true },
  file: {
    filename: String,
    originalname: String,
    path: String,
    size: Number,
    mimetype: String
  }
}, {
  timestamps: true
});

AssignmentSchema.index({ createdAt: -1 });

module.exports = mongoose.models.Assignment || mongoose.model("Assignment", AssignmentSchema);
