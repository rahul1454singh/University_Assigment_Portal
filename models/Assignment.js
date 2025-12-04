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
  },

  // ---------- Added fields for "Submit for Review" workflow ----------
  // stores the selected professor who will review this assignment
  reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: "UserData", default: null },

  // human-friendly reviewer name (copied at submission time)
  reviewerName: { type: String, default: "" },

  // timestamp when student submitted for review
  submittedAt: { type: Date, default: null },

  // optional message student sends to the reviewer during submission
  studentMessage: { type: String, default: "" }
  // -------------------------------------------------------------------
}, {
  timestamps: true
});

AssignmentSchema.index({ createdAt: -1 });

module.exports = mongoose.models.Assignment || mongoose.model("Assignment", AssignmentSchema);
