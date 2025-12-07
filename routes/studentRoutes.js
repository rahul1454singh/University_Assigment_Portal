// routes/studentRoutes.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const { verifyStudent } = require("../middleware/authMiddleware");
const Assignment = require("../models/Assignment");
const User = require("../models/UserData");
const Department = require("../models/Department"); // ensure Department is required
const router = express.Router();

// uploads directory
const uploadDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const safe = file.originalname
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_\.\-]/g, "");
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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter
});

// helper to load counts + recent for dashboard/profile pages
async function loadDashboardData(userId) {
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
  return { counts, recent };
}

// DASHBOARD
router.get("/student/dashboard", verifyStudent, async (req, res) => {
  try {
    const userId = req.user._id;
    const { counts, recent } = await loadDashboardData(userId);
    return res.render("student-dashboard", { counts, recent, user: req.user });
  } catch (err) {
    console.error("Error loading student dashboard:", err);
    return res.status(500).send("Error loading dashboard");
  }
});

// PROFILE (GET) - render profile showing department name (readonly)
// IMPORTANT: fetch user from DB and populate department so we can render department name
router.get("/student/profile", verifyStudent, async (req, res) => {
  try {
    // fetch full user from DB to ensure we have department populated (not just what middleware set)
    const userId = req.user && req.user._id ? req.user._id : null;
    if (!userId) {
      return res.status(401).send("Not authenticated");
    }

    // try to populate department. If populate is not present, we'll attempt lookup.
    let user = await User.findById(userId).populate("department").lean();

    // if user is found and department is an object, set departmentName
    if (user) {
      if (user.department && typeof user.department === "object" && user.department.name) {
        user.departmentName = user.department.name;
      } else if (user.department && typeof user.department === "string") {
        // department is an id string; try to fetch department name
        try {
          const dep = await Department.findById(user.department).lean();
          if (dep && dep.name) user.departmentName = dep.name;
        } catch (e) {
          // ignore lookup errors
          user.departmentName = "";
        }
      } else {
        user.departmentName = "";
      }
    }

    return res.render("student-profile", { user });
  } catch (err) {
    console.error("Error loading student profile:", err);
    return res.status(500).send("Error loading profile");
  }
});

// PROFILE (POST) - accepts only phone and newPassword (name/email/department not editable)
router.post("/student/profile", verifyStudent, async (req, res) => {
  try {
    const userId = req.user._id;
    const { phone = "", newPassword = "" } = req.body || {};

    if (newPassword && newPassword.length > 0 && newPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found." });

    // update phone only
    if (typeof phone === "string") user.phone = phone.trim();

    // update password if provided
    if (newPassword && newPassword.length >= 6) {
      const hashed = await bcrypt.hash(newPassword, 10);
      user.password = hashed;
    }

    const saved = await user.save();

    // try to get department name for response
    let departmentName = "";
    if (saved.department) {
      try {
        // first attempt populate
        const dep = await Department.findById(saved.department).lean();
        if (dep) departmentName = dep.name || "";
      } catch (e) {
        departmentName = "";
      }
    }

    const safeUser = {
      _id: saved._id,
      name: saved.name,
      email: saved.email,
      phone: saved.phone,
      department: saved.department,
      departmentName
    };

    return res.json({ message: "Profile updated.", user: safeUser });
  } catch (err) {
    console.error("Error updating profile:", err);
    return res.status(500).json({ error: "Server error while updating profile." });
  }
});

// ASSIGNMENTS LIST
// <-- THIS IS THE ROUTE THAT WAS MISSING AND CAUSED {"message":"Not Found"}
router.get("/student/assignments", verifyStudent, async (req, res) => {
  try {
    const userId = req.user._id;
    const assignments = await Assignment.find({ user: userId })
      .sort({ createdAt: -1 })
      .lean();
    return res.render("assignments-list", { assignments, user: req.user });
  } catch (err) {
    console.error("Error loading assignments list:", err);
    return res.status(500).send("Error loading assignments");
  }
});

// UPLOAD FORM
router.get("/student/assignments/upload", verifyStudent, (req, res) => {
  res.render("upload-assignment", {
    error: null,
    success: null,
    assignmentId: null
  });
});

// SINGLE UPLOAD
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

// BULK UPLOAD FORM
router.get("/student/assignments/bulk-upload", verifyStudent, (req, res) => {
  res.render("bulk-upload-assignments", { error: null, success: null });
});

// BULK UPLOAD POST
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

// DELETE FILE from assignment (remove file field)
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

// EDIT FORM (GET)
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

    // --- NEW: fetch student's department and list professors in that dept ---
    // Fetch latest user record (to be sure department is available)
    let student = await User.findById(userId).lean();
    let professors = [];
    try {
      const deptId = student && student.department ? student.department : null;
      if (deptId) {
        professors = await User.find({ role: "Professor", department: deptId })
          .select("_id fullName name") // prefer fullName, fallback to name
          .lean();
      }
    } catch (e) {
      console.error("Error fetching professors for edit page:", e);
      professors = [];
    }
    // pass 'user' so templates can show short name, and 'professors' to populate dropdowns
    return res.render("edit-assignment", { assignment, error: null, success: null, user: req.user, professors });
  } catch (err) {
    console.error("Error loading edit page:", err);
    return res.status(500).send("Error loading assignment");
  }
});

// EDIT POST (update fields, optionally replace file)
// server blocks edits if assignment.status === "Submitted"
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

      // If assignment already submitted, prevent editing
      if (assignment.status === "Submitted") {
        return res.render("edit-assignment", {
          assignment: assignment.toObject(),
          error: "This assignment has already been submitted and cannot be edited.",
          success: null
        });
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
        success: "Updated successfully",
        user: req.user // pass user along to template
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

// --- NEW: Submit for Review route ---
router.post("/student/assignments/:id/submit", verifyStudent, async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    const assignmentId = req.params.id;
    const { reviewerId } = req.body || {};

    if (!userId) return res.status(401).json({ success: false, message: "Not authenticated" });
    if (!assignmentId) return res.status(400).json({ success: false, message: "Missing assignment id" });
    if (!reviewerId) return res.status(400).json({ success: false, message: "Please select a reviewer" });

    // Fetch assignment and ensure ownership + draft status
    const assignment = await Assignment.findOne({ _id: assignmentId, user: userId });
    if (!assignment) return res.status(404).json({ success: false, message: "Assignment not found" });

    // allow only Draft -> Submitted
    const currentStatus = (assignment.status || "").toString().toLowerCase();
    if (currentStatus !== "draft") {
      return res.status(400).json({ success: false, message: "Only draft assignments can be submitted" });
    }

    // Fetch reviewer and validate role and department match
    const reviewer = await User.findById(reviewerId).lean();
    if (!reviewer) return res.status(404).json({ success: false, message: "Selected professor not found" });

    // adjust these checks to match your schema: some apps use role: 'Professor' or 'professor'
    const reviewerRole = (reviewer.role || "").toString().toLowerCase();
    if (reviewerRole !== "professor") {
      return res.status(400).json({ success: false, message: "Selected user is not a professor" });
    }

    // ensure same department (if you want this rule)
    const student = await User.findById(userId).lean();
    const studentDept = student && student.department ? student.department.toString() : null;
    const reviewerDept = reviewer && reviewer.department ? reviewer.department.toString() : null;
    if (!studentDept || !reviewerDept || studentDept !== reviewerDept) {
      return res.status(400).json({ success: false, message: "Professor must belong to your department" });
    }

    // Update assignment
    assignment.status = "Submitted"; // or 'submitted' depending on your conventions
    assignment.reviewerId = reviewer._id;
    // store a denormalized reviewer name to show quickly on UI
    assignment.reviewerName = reviewer.fullName || reviewer.name || (reviewer.email || "").split("@")[0];
    assignment.submittedAt = new Date();

    // Prevent further edits: either use 'locked' flag or rely on status check in edit POST (you already block edits when status === 'Submitted')
    assignment.locked = true; // optional field — create in schema if you want

    await assignment.save();

    // Create a Notification doc if you have Notification model — optional
    try {
      const Notification = require("../models/Notification"); // adjust path/name
      await Notification.create({
        user: reviewer._id,
        title: "New assignment submitted for review",
        message: `${student.name || student.fullName || "A student"} submitted "${assignment.title}" for your review.`,
        assignmentId: assignment._id,
        read: false,
        createdAt: new Date()
      });
    } catch (notifErr) {
      // If Notification model missing, it's fine — log and continue
      console.info("Notification not created (missing model or other error):", notifErr.message || notifErr);
    }

    return res.json({ success: true, message: "Assignment submitted and professor notified." });
  } catch (err) {
    console.error("Error submitting assignment:", err);
    return res.status(500).json({ success: false, message: "Server error while submitting assignment." });
  }
});

// DELETE ASSIGNMENT
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

// ASSIGNMENT DETAILS
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

    // --- NEW: fetch student's department and list professors in that dept ---
    let professors = [];
    try {
      const student = await User.findById(userId).lean();
      const deptId = student && student.department ? student.department : null;
      if (deptId) {
        professors = await User.find({ role: "Professor", department: deptId })
          .select("_id fullName name") // prefer fullName, fallback to name
          .lean();
      }
    } catch (e) {
      console.error("Error fetching professors for assignment details:", e);
      professors = [];
    }

    // pass 'user' and 'professors' so the view can show student short name and populate dropdown
    return res.render("assignment-details", { assignment, user: req.user, professors });
  } catch (err) {
    console.error("Error loading assignment details:", err);
    return res.status(500).send("Error loading assignment");
  }
});

module.exports = router;
