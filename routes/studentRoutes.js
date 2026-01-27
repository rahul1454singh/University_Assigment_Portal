// routes/studentRoutes.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const { verifyStudent } = require("../middleware/authMiddleware");
const Assignment = require("../models/Assignment");
const User = require("../models/UserData");
const Department = require("../models/Department");
const router = express.Router();

/* ================= UPLOAD SETUP ================= */
const uploadDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safe = file.originalname
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_.-]/g, "");
    cb(null, `${Date.now()}_${safe}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    file.mimetype === "application/pdf"
      ? cb(null, true)
      : cb(new Error("Only PDF files allowed"))
});

/* ================= HELPER ================= */
async function loadDashboardData(userId) {
  const agg = await Assignment.aggregate([
    { $match: { user: userId } },
    { $group: { _id: "$status", count: { $sum: 1 } } }
  ]);
  const counts = { Draft: 0, Submitted: 0, Approved: 0, Rejected: 0 };
  agg.forEach(i => counts[i._id] = i.count);

  const recent = await Assignment.find({ user: userId })
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  return { counts, recent };
}

/* ================= DASHBOARD ================= */
router.get("/student/dashboard", verifyStudent, async (req, res) => {
  try {
    const { counts, recent } = await loadDashboardData(req.user._id);
    return res.render("student-dashboard", { user: req.user, counts, recent });
  } catch (err) {
    console.error(err);
    return res.status(500).send("Error loading dashboard");
  }
});

/* ================= PROFILE ================= */
router.get("/student/profile", verifyStudent, async (req, res) => {
  try {
    let user = await User.findById(req.user._id)
      .populate("department")
      .lean();
    if (user?.department?.name) user.departmentName = user.department.name;
    return res.render("student-profile", { user });
  } catch (err) {
    console.error(err);
    return res.status(500).send("Error loading profile");
  }
});

/* ================= ASSIGNMENT LIST ================= */
router.get("/student/assignments", verifyStudent, async (req, res) => {
  try {
    const assignments = await Assignment.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .lean();
    return res.render("assignments-list", { assignments, user: req.user });
  } catch (err) {
    console.error(err);
    return res.status(500).send("Error loading assignments");
  }
});

/* ================= UPLOAD FORM ================= */
router.get("/student/assignments/upload", verifyStudent, async (req, res) => {
  try {
    const student = await User.findById(req.user._id).lean();
    let professors = [];
    if (student?.department) {
      professors = await User.find({
        role: "Professor",
        department: student.department
      }).select("_id fullName name").lean();
    }

    return res.render("upload-assignment", {
      error: null,
      success: null,
      assignmentId: null,
      professors,
      user: req.user
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send("Error loading upload page");
  }
});

/* ================= SINGLE UPLOAD ================= */
router.post(
  "/student/assignments/upload",
  verifyStudent,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.render("upload-assignment", {
          error: "Please upload a PDF file (max 10MB).",
          success: null,
          assignmentId: null
        });
      }

      const { title, description, category, professor } = req.body;

      if (!title || !category) {
        fs.unlinkSync(req.file.path);
        return res.render("upload-assignment", {
          error: "Title and Category are required.",
          success: null,
          assignmentId: null
        });
      }

      const saved = await new Assignment({
        title,
        description,
        category,
        user: req.user._id,
        status: "Draft",
        reviewerId: professor,
        file: {
          filename: req.file.filename,
          originalname: req.file.originalname,
          path: `/uploads/${req.file.filename}`,
          size: req.file.size,
          mimetype: req.file.mimetype
        }
      }).save();

      return res.render("upload-assignment", {
        error: null,
        success: "Your assignment has been uploaded successfully.",
        assignmentId: saved._id
      });
    } catch (err) {
      console.error(err);
      return res.status(500).render("upload-assignment", {
        error: "Server error while uploading.",
        success: null,
        assignmentId: null
      });
    }
  }
);

/* =====================================================
   ✅ FIXED PART STARTS HERE
   EDIT ROUTE MUST COME BEFORE :id ROUTE
===================================================== */

// EDIT ASSIGNMENT (GET) — FIXED ORDER
router.get("/student/assignments/:id/edit", verifyStudent, async (req, res) => {
  try {
    const assignment = await Assignment.findOne({
      _id: req.params.id,
      user: req.user._id
    }).lean();

    if (!assignment) return res.status(404).send("Assignment not found");

    return res.render("edit-assignment", {
      assignment,
      error: null,
      success: null,
      user: req.user
    });
  } catch (err) {
    console.error("Edit error:", err);
    return res.status(500).send("Error loading edit page");
  }
});

/* ================= ASSIGNMENT DETAILS ================= */
router.get("/student/assignments/:id", verifyStudent, async (req, res) => {
  try {
    const assignment = await Assignment.findOne({
      _id: req.params.id,
      user: req.user._id
    }).lean();

    if (!assignment) return res.status(404).send("Assignment not found");

    return res.render("assignment-details", {
      assignment,
      user: req.user
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send("Error loading assignment");
  }
});

module.exports = router;
