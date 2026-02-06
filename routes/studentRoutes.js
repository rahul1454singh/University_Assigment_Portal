const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const { verifyStudent } = require("../middleware/authMiddleware");
const Assignment = require("../models/Assignment");
const User = require("../models/UserData");

const router = express.Router();

/* ===================== UPLOAD SETUP ===================== */

const uploadDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/\s+/g, "_");
    cb(null, `${Date.now()}_${safe}`);
  }
});

function fileFilter(req, file, cb) {
  if (file.mimetype === "application/pdf") cb(null, true);
  else cb(new Error("Only PDF files allowed"));
}

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter
});

/* ===================== DASHBOARD ===================== */

router.get("/student/dashboard", verifyStudent, async (req, res) => {
  const userId = req.user._id;

  const agg = await Assignment.aggregate([
    { $match: { user: userId } },
    { $group: { _id: "$status", count: { $sum: 1 } } }
  ]);

  const counts = { Draft: 0, Submitted: 0, Approved: 0, Rejected: 0 };
  agg.forEach(i => (counts[i._id] = i.count));

  const recent = await Assignment.find({ user: userId })
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  res.render("student-dashboard", { counts, recent, user: req.user });
});

/* ===================== PROFILE ===================== */

router.get("/student/profile", verifyStudent, async (req, res) => {
  const user = await User.findById(req.user._id)
    .populate("department")
    .lean();

  user.departmentName = user.department?.name || "";
  res.render("student-profile", { user });
});

/* ===================== ASSIGNMENTS LIST ===================== */

router.get("/student/assignments", verifyStudent, async (req, res) => {
  const assignments = await Assignment.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .lean();

  res.render("assignments-list", { assignments, user: req.user });
});

/* ===================== UPLOAD PAGE (FIXED) ===================== */

router.get("/student/assignments/upload", verifyStudent, async (req, res) => {
  // Use Regex for role to catch 'Professor' or 'professor'
  // We search by department ID. If that fails, the fallback below catches all professors.
  let professors = await User.find({
    role: { $regex: /^professor$/i },
    department: req.user.department
  })
  .select("_id name fullName")
  .lean();

  // FINAL FALLBACK: If the department filter is causing the empty list, 
  // show all professors so the student is never stuck with an empty dropdown.
  if (!professors || professors.length === 0) {
    professors = await User.find({ 
      role: { $regex: /^professor$/i } 
    })
    .select("_id name fullName")
    .lean();
  }

  res.render("upload-assignment", {
    error: null,
    success: null,
    professors,
    user: req.user
  });
});

/* ===================== BULK UPLOAD PAGE (FIXED) ===================== */

router.get("/student/assignments/bulk-upload", verifyStudent, async (req, res) => {
  let professors = await User.find({
    role: { $regex: /^professor$/i },
    department: req.user.department
  }).select("_id name fullName").lean();

  if (!professors || professors.length === 0) {
    professors = await User.find({ role: { $regex: /^professor$/i } }).select("_id name fullName").lean();
  }

  res.render("bulk-upload", {
    professors,
    error: null,
    user: req.user
  });
});

/* ===================== BULK UPLOAD POST ===================== */

router.post("/student/assignments/bulk-upload", verifyStudent, async (req, res) => {
  let professors = await User.find({
    role: { $regex: /^professor$/i },
    department: req.user.department
  }).select("_id name fullName").lean();

  if (!professors || professors.length === 0) {
    professors = await User.find({ role: { $regex: /^professor$/i } }).select("_id name fullName").lean();
  }

  res.render("bulk-upload", {
    professors,
    error: "Bulk upload feature is coming soon. Please upload assignments one by one.",
    user: req.user
  });
});

/* ===================== UPLOAD POST (FIXED) ===================== */

router.post(
  "/student/assignments/upload",
  verifyStudent,
  upload.single("file"),
  async (req, res) => {

    let professors = await User.find({
      role: { $regex: /^professor$/i },
      department: req.user.department
    }).select("_id name fullName").lean();

    if (!professors || professors.length === 0) {
      professors = await User.find({ role: { $regex: /^professor$/i } }).select("_id name fullName").lean();
    }

    if (!req.file) {
      return res.render("upload-assignment", {
        error: "Upload PDF file",
        success: null,
        professors,
        user: req.user
      });
    }

    const assignment = new Assignment({
      title: req.body.title,
      description: req.body.description,
      category: req.body.category,
      reviewerId: req.body.professor,
      user: req.user._id,
      status: "Draft",
      file: {
        filename: req.file.filename,
        originalname: req.file.originalname,
        path: `/uploads/${req.file.filename}`,
        size: req.file.size
      }
    });

    await assignment.save();

    res.render("upload-assignment", {
      success: "Uploaded successfully",
      error: null,
      professors,
      user: req.user
    });
  }
);

/* ===================== EDIT ASSIGNMENT ===================== */

router.get("/student/assignments/:id/edit", verifyStudent, async (req, res) => {
  const assignment = await Assignment.findOne({
    _id: req.params.id,
    user: req.user._id,
    status: { $in: ["Draft", "Rejected", "Submitted"] }
  }).lean();

  if (!assignment) {
    return res.status(403).send("This assignment cannot be edited");
  }

  let professors = await User.find({
    role: { $regex: /^professor$/i },
    department: req.user.department
  }).select("_id name fullName").lean();

  if (!professors || professors.length === 0) {
    professors = await User.find({ role: { $regex: /^professor$/i } }).select("_id name fullName").lean();
  }

  res.render("edit-assignment", {
    assignment,
    professors,
    user: req.user,
    error: null,
    success: null
  });
});

/* ===================== ASSIGNMENT DETAILS ===================== */

router.get("/student/assignments/:id", verifyStudent, async (req, res) => {
  const assignment = await Assignment.findOne({
    _id: req.params.id,
    user: req.user._id
  }).lean();

  if (!assignment) {
    return res.status(404).send("Assignment not found");
  }

  let professors = await User.find({
    role: { $regex: /^professor$/i },
    department: req.user.department
  }).select("_id name fullName").lean();

  if (!professors || professors.length === 0) {
    professors = await User.find({ role: { $regex: /^professor$/i } }).select("_id name fullName").lean();
  }

  res.render("assignment-details", {
    assignment,
    user: req.user,
    professors
  });
});

/* ===================== SUBMIT ASSIGNMENT ===================== */

router.post("/student/assignments/:id/submit", verifyStudent, async (req, res) => {
  const { reviewerId } = req.body;

  const assignment = await Assignment.findOne({
    _id: req.params.id,
    user: req.user._id,
    status: { $in: ["Draft", "Rejected"] }
  });

  if (!assignment) {
    return res.json({ success: false });
  }

  assignment.status = "Submitted";
  assignment.reviewerId = reviewerId;
  assignment.submittedAt = new Date();

  await assignment.save();
  res.json({ success: true });
});

/* ===================== DELETE ASSIGNMENT ===================== */

router.post("/student/assignments/:id/delete", verifyStudent, async (req, res) => {
  const assignment = await Assignment.findOne({
    _id: req.params.id,
    user: req.user._id
  });

  if (!assignment) {
    return res.json({ success: false });
  }

  if (assignment.status === "Approved") {
    return res.json({
      success: false,
      message: "Approved assignments cannot be deleted"
    });
  }

  await Assignment.deleteOne({ _id: assignment._id });
  res.json({ success: true });
});

module.exports = router;