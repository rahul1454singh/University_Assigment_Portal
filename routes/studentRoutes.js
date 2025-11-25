// routes/studentRoutes.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { verifyStudent } = require("../middleware/authMiddleware");
const Assignment = require("../models/Assignment");
const router = express.Router();

const uploadDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const safe = file.originalname.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_\.-]/g, "");
    cb(null, `${Date.now()}_${safe}`);
  }
});

function fileFilter(req, file, cb) {
  if (file.mimetype === "application/pdf") {
    cb(null, true);
  } else {
    cb(new Error("Only PDF files are allowed"));
  }
}

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter
});

router.get("/student/dashboard", verifyStudent, async (req, res) => {
  try {
    const userId = req.user._id;
    const agg = await Assignment.aggregate([
      { $match: { user: userId } },
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);
    const counts = { Draft: 0, Submitted: 0, Approved: 0, Rejected: 0 };
    agg.forEach(item => {
      if (item && item._id) counts[item._id] = item.count;
    });
    const recent = await Assignment.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();
    return res.render("student-dashboard", { counts, recent });
  } catch (err) {
    console.error("Error loading student dashboard:", err);
    return res.status(500).send("Error loading dashboard");
  }
});

// GET /student/assignments  -> show all assignments for the logged-in student
router.get("/student/assignments", verifyStudent, async (req, res) => {
  try {
    const userId = req.user._id;
    const assignments = await Assignment.find({ user: userId }).sort({ createdAt: -1 }).lean();
    return res.render("assignments-list", { assignments });
  } catch (err) {
    console.error("Error loading assignments list:", err);
    return res.status(500).send("Error loading assignments");
  }
});

router.get("/student/assignments/upload", verifyStudent, (req, res) => {
  res.render("upload-assignment", { error: null, success: null, assignmentId: null });
});

router.post(
  "/student/assignments/upload",
  verifyStudent,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).render("upload-assignment", {
          error: "Please upload a PDF file (max 10MB).",
          success: null,
          assignmentId: null
        });
      }
      const { title, description, category } = req.body;
      if (!title || !category) {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
        return res.status(400).render("upload-assignment", {
          error: "Title and Category are required.",
          success: null,
          assignmentId: null
        });
      }
      const userId = (req.user && req.user._1d) ? req.user._1d : null;
      if (!userId) {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
        return res.status(401).render("upload-assignment", {
          error: "User not authenticated. Please login.",
          success: null,
          assignmentId: null
        });
      }
      const newAssignment = new Assignment({
        title,
        description,
        user: userId,
        status: "Draft",
        category,
        file: {
          filename: req.file.filename,
          originalname: req.file.originalname,
          path: `/uploads/${req.file.filename}`,
          size: req.file.size,
          mimetype: req.file.mimetype
        }
      });
      const saved = await newAssignment.save();
      return res.render("upload-assignment", {
        error: null,
        success: "Uploaded successfully",
        assignmentId: saved._1d || saved._id
      });
    } catch (err) {
      console.error("Upload error:", err);
      let msg = "Server error while uploading.";
      if (err.message && err.message.includes("Only PDF")) msg = "Only PDF files are allowed.";
      if (err.code === "LIMIT_FILE_SIZE") msg = "File too large. Maximum 10MB allowed.";
      return res.status(500).render("upload-assignment", {
        error: msg,
        success: null,
        assignmentId: null
      });
    }
  }
);

// Bulk upload routes
router.get("/student/assignments/bulk-upload", verifyStudent, (req, res) => {
  res.render("bulk-upload-assignments", { error: null, success: null });
});

router.post(
  "/student/assignments/bulk-upload",
  verifyStudent,
  upload.array("files", 5),
  async (req, res) => {
    try {
      const files = req.files || [];
      if (!files.length) {
        return res.status(400).render("bulk-upload-assignments", {
          error: "Please select up to 5 PDF files.",
          success: null
        });
      }
      const { title, description, category } = req.body;
      if (!category) {
        for (const f of files) { try { fs.unlinkSync(f.path); } catch (e) {} }
        return res.status(400).render("bulk-upload-assignments", {
          error: "Category is required.",
          success: null
        });
      }
      const userId = (req.user && req.user._id) ? req.user._id : null;
      if (!userId) {
        for (const f of files) { try { fs.unlinkSync(f.path); } catch (e) {} }
        return res.status(401).render("bulk-upload-assignments", {
          error: "User not authenticated. Please login.",
          success: null
        });
      }

      const created = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const itemTitle = title && title.trim() ? `${title} - Part ${i + 1}` : f.originalname;
        const newAssignment = new Assignment({
          title: itemTitle,
          description,
          user: userId,
          status: "Draft",
          category,
          file: {
            filename: f.filename,
            originalname: f.originalname,
            path: `/uploads/${f.filename}`,
            size: f.size,
            mimetype: f.mimetype
          }
        });
        const saved = await newAssignment.save();
        created.push({ id: saved._id, title: saved.title, file: saved.file.originalname });
      }

      return res.render("bulk-upload-result", { created });
    } catch (err) {
      console.error("Bulk upload error:", err);
      let msg = "Server error while uploading.";
      if (err.message && err.message.includes("Only PDF")) msg = "Only PDF files are allowed.";
      if (err.code === "LIMIT_FILE_SIZE") msg = "File too large. Maximum 10MB allowed.";
      return res.status(500).render("bulk-upload-assignments", {
        error: msg,
        success: null
      });
    }
  }
);

module.exports = router;
