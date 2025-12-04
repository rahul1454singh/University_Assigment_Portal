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
    const safe = file.originalname
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_\.-]/g, "");
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
    return res.render("student-dashboard", { counts, recent, user: req.user });
  } catch (err) {
    console.error("Error loading student dashboard:", err);
    return res.status(500).send("Error loading dashboard");
  }
});

router.get("/student/assignments", verifyStudent, async (req, res) => {
  try {
    const userId = req.user._id;
    const assignments = await Assignment.find({ user: userId })
      .sort({ createdAt: -1 })
      .lean();
    return res.render("assignments-list", { assignments });
  } catch (err) {
    console.error("Error loading assignments list:", err);
    return res.status(500).send("Error loading assignments");
  }
});

router.get("/student/assignments/upload", verifyStudent, (req, res) => {
  res.render("upload-assignment", {
    error: null,
    success: null,
    assignmentId: null
  });
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
      const userId = req.user && req.user._id ? req.user._id : null;
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
        assignmentId: saved._id
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
      const userId = req.user && req.user._id ? req.user._id : null;
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
        created.push({
          id: saved._id,
          title: saved.title,
          file: saved.file.originalname
        });
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

router.post("/student/assignments/:id/file/delete", verifyStudent, async (req, res) => {
  try {
    const userId = req.user._id;
    const assignment = await Assignment.findOne({
      _id: req.params.id,
      user: userId
    });
    if (!assignment) {
      return res.status(404).json({ success: false, message: "Assignment not found" });
    }
    if (!assignment.file || !assignment.file.filename) {
      return res.json({ success: true });
    }
    const oldPath = path.join(uploadDir, assignment.file.filename);
    try { fs.unlinkSync(oldPath); } catch (e) {}
    assignment.file = undefined;
    await assignment.save();
    return res.json({ success: true });
  } catch (err) {
    console.error("Error deleting file:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/student/assignments/:id/edit", verifyStudent, async (req, res) => {
  try {
    const userId = req.user._id;
    const assignment = await Assignment.findOne({
      _id: req.params.id,
      user: userId
    }).lean();
    if (!assignment) {
      return res.status(404).send("Assignment not found");
    }
    return res.render("edit-assignment", { assignment, error: null, success: null });
  } catch (err) {
    console.error("Error loading edit page:", err);
    return res.status(500).send("Error loading assignment");
  }
});

router.post(
  "/student/assignments/:id/edit",
  verifyStudent,
  upload.single("newFile"),
  async (req, res) => {
    try {
      const userId = req.user._id;
      let assignment = await Assignment.findOne({
        _id: req.params.id,
        user: userId
      });
      if (!assignment) {
        return res.status(404).send("Assignment not found");
      }

      const { title, description, category } = req.body;
      if (!title || !category) {
        if (req.file) { try { fs.unlinkSync(req.file.path); } catch (e) {} }
        return res.render("edit-assignment", {
          assignment: assignment.toObject(),
          error: "Title and Category are required.",
          success: null
        });
      }

      assignment.title = title;
      assignment.description = description;
      assignment.category = category;

      if (req.file) {
        if (assignment.file && assignment.file.filename) {
          const oldPath = path.join(uploadDir, assignment.file.filename);
          try { fs.unlinkSync(oldPath); } catch (e) {}
        }
        assignment.file = {
          filename: req.file.filename,
          originalname: req.file.originalname,
          path: `/uploads/${req.file.filename}`,
          size: req.file.size,
          mimetype: req.file.mimetype
        };
      }

      const saved = await assignment.save();
      return res.render("edit-assignment", {
        assignment: saved.toObject(),
        error: null,
        success: "Updated successfully"
      });
    } catch (err) {
      console.error("Error updating assignment:", err);
      let msg = "Server error while updating.";
      if (err.message && err.message.includes("Only PDF")) msg = "Only PDF files are allowed.";
      if (err.code === "LIMIT_FILE_SIZE") msg = "File too large. Maximum 10MB allowed.";
      return res.status(500).render("edit-assignment", {
        assignment: { _id: req.params.id, title: req.body.title, description: req.body.description, category: req.body.category },
        error: msg,
        success: null
      });
    }
  }
);

router.post("/student/assignments/:id/delete", verifyStudent, async (req, res) => {
  try {
    const userId = req.user._id;
    const assignment = await Assignment.findOne({
      _id: req.params.id,
      user: userId
    });
    if (!assignment) {
      return res.status(404).json({ success: false, message: "Assignment not found" });
    }
    if (assignment.file && assignment.file.filename) {
      const oldPath = path.join(uploadDir, assignment.file.filename);
      try { fs.unlinkSync(oldPath); } catch (e) {}
    }
    await Assignment.deleteOne({ _id: assignment._id });
    return res.json({ success: true });
  } catch (err) {
    console.error("Error deleting assignment:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/student/assignments/:id", verifyStudent, async (req, res) => {
  try {
    const userId = req.user._id;
    const assignment = await Assignment.findOne({
      _id: req.params.id,
      user: userId
    }).lean();
    if (!assignment) {
      return res.status(404).send("Assignment not found");
    }
    return res.render("assignment-details", { assignment });
  } catch (err) {
    console.error("Error loading assignment details:", err);
    return res.status(500).send("Error loading assignment");
  }
});

module.exports = router;