console.log("✅ professorRoutes.js loaded");

const express = require("express");
const bcrypt = require("bcryptjs");
const router = express.Router();

const Assignment = require("../models/Assignment");
const Professor = require("../models/Professor");
const Notification = require("../models/Notification");
const { verifyProfessor } = require("../middleware/authMiddleware");

/* =================================================
   DASHBOARD HANDLER (REUSED)
================================================= */
async function dashboardHandler(req, res) {
  try {
    if (!req.professor || !req.professor._id) {
      return res.status(401).send("Unauthorized");
    }

    const professorId = req.professor._id;

    const pendingCount = await Assignment.countDocuments({
      reviewerId: professorId,
      status: "Submitted"
    });

    const approvedCount = await Assignment.countDocuments({
      reviewerId: professorId,
      status: "Approved"
    });

    const rejectedCount = await Assignment.countDocuments({
      reviewerId: professorId,
      status: "Rejected"
    });

    const totalReviewed = approvedCount + rejectedCount;

    const allReviews = await Assignment.find({
      reviewerId: professorId
    })
      .populate("user", "name")
      .sort({ submittedAt: -1 })
      .lean();

    const now = new Date();
    const withDays = a => {
      const base = a.submittedAt || a.createdAt;
      const daysPending = Math.floor(
        (now - new Date(base)) / (1000 * 60 * 60 * 24)
      );
      return { ...a, daysPending };
    };

    res.render("professor-dashboard", {
      professorName: req.professor.name,
      counts: {
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
        total: totalReviewed
      },
      allReviews: allReviews.map(withDays)
    });

  } catch (err) {
    console.error("Professor dashboard error:", err);
    res.status(500).send("Server error");
  }
}

/* =================================================
   PROFILE GET HANDLER
================================================= */
async function profileGetHandler(req, res) {
  try {
    if (!req.professor || !req.professor._id) {
      return res.status(401).send("Unauthorized");
    }

    const professor = await Professor.findById(req.professor._id)
      .populate("department", "name")
      .lean();

    if (!professor) {
      return res.status(404).send("Professor not found");
    }

    res.render("professor-profile", {
      professor: {
        name: professor.name || "",
        email: professor.email || "",
        phone: professor.phone || "",
        departmentName: professor.department?.name || "N/A"
      }
    });

  } catch (err) {
    console.error("Professor profile error:", err);
    res.status(500).send("Server error");
  }
}

/* =================================================
   PROFILE POST HANDLER
================================================= */
async function profilePostHandler(req, res) {
  try {
    if (!req.professor || !req.professor._id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { phone, newPassword } = req.body;
    const update = {};

    if (phone) update.phone = phone;

    if (newPassword) {
      update.password = await bcrypt.hash(newPassword, 10);
    }

    await Professor.findByIdAndUpdate(req.professor._id, update);
    res.json({ message: "Profile updated successfully" });

  } catch (err) {
    console.error("Profile update error:", err);
    res.status(500).json({ error: "Update failed" });
  }
}

/* =================================================
   ORIGINAL ROUTES
================================================= */
router.get("/dashboard", verifyProfessor, dashboardHandler);
router.get("/profile", verifyProfessor, profileGetHandler);
router.post("/profile", verifyProfessor, profilePostHandler);

/* =================================================
   🔥 ALIAS ROUTES (FIX FRONTEND URLS)
================================================= */
router.get("/professor/dashboard", verifyProfessor, dashboardHandler);
router.get("/professor/profile", verifyProfessor, profileGetHandler);
router.post("/professor/profile", verifyProfessor, profilePostHandler);

/* =================================================
   REVIEW ASSIGNMENT (GET)
================================================= */
async function reviewHandler(req, res) {
  try {
    if (!req.professor || !req.professor._id) {
      return res.status(401).send("Unauthorized");
    }

    const assignment = await Assignment.findOne({
      _id: req.params.id,
      reviewerId: req.professor._id
    }).populate("user", "name email");

    if (!assignment) {
      return res.status(404).send("Assignment not found");
    }

    res.render("review-assignment", {
      assignment,
      professorName: req.professor.name
    });

  } catch (err) {
    console.error("Review page error:", err);
    res.status(500).send("Server error");
  }
}

/* ORIGINAL */
router.get("/assignments/:id/review", verifyProfessor, reviewHandler);

/* 🔥 ALIAS (FIX 404 ON REVIEW BUTTON) */
router.get("/professor/assignments/:id/review", verifyProfessor, reviewHandler);

/* =================================================
   APPROVE / REJECT ASSIGNMENT (ORIGINAL)
================================================= */
router.post("/assignments/:id/decision", verifyProfessor, async (req, res) => {
  try {
    const { status, remarks } = req.body;

    if (!["Approved", "Rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid action" });
    }

    const assignment = await Assignment.findOne({
      _id: req.params.id,
      reviewerId: req.professor._id
    });

    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    assignment.reviewHistory ||= [];
    assignment.status = status;
    assignment.rejectionRemarks = status === "Rejected" ? remarks : "";

    assignment.reviewHistory.push({
      action: status,
      professorId: req.professor._id,
      professorName: req.professor.name,
      remarks
    });

    await assignment.save();

    await Notification.create({
      userId: assignment.user,
      title: `Assignment ${status}`,
      message: `Your assignment "${assignment.title}" has been ${status.toLowerCase()}.`,
      assignmentId: assignment._id
    });

    res.json({
      message:
        status === "Approved"
          ? "Assignment approved successfully"
          : "Assignment rejected successfully"
    });

  } catch (err) {
    console.error("Decision error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* =================================================
   🔥 ALIAS (FIX APPROVE / REJECT 404)
================================================= */
router.post("/professor/assignments/:id/decision", verifyProfessor, async (req, res) => {
  try {
    const { status, remarks } = req.body;

    if (!["Approved", "Rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid action" });
    }

    const assignment = await Assignment.findOne({
      _id: req.params.id,
      reviewerId: req.professor._id
    });

    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    assignment.reviewHistory ||= [];
    assignment.status = status;
    assignment.rejectionRemarks = status === "Rejected" ? remarks : "";

    assignment.reviewHistory.push({
      action: status,
      professorId: req.professor._id,
      professorName: req.professor.name,
      remarks
    });

    await assignment.save();

    await Notification.create({
      userId: assignment.user,
      title: `Assignment ${status}`,
      message: `Your assignment "${assignment.title}" has been ${status.toLowerCase()}.`,
      assignmentId: assignment._id
    });

    res.json({
      message:
        status === "Approved"
          ? "Assignment approved successfully"
          : "Assignment rejected successfully"
    });

  } catch (err) {
    console.error("Decision error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
