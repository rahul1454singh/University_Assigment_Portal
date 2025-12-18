const express = require("express");
const bcrypt = require("bcryptjs");
const router = express.Router();

const Assignment = require("../models/Assignment");
const Professor = require("../models/Professor");
const { verifyProfessor } = require("../middleware/authMiddleware");

/* ================================
   PROFESSOR DASHBOARD
================================ */
router.get("/professor/dashboard", verifyProfessor, async (req, res) => {
  try {
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

    const pendingAssignments = await Assignment.find({
      reviewerId: professorId,
      status: "Submitted"
    })
      .populate("user", "name")
      .sort({ submittedAt: 1 })
      .limit(3)
      .lean();

    const recentReviewed = await Assignment.find({
      reviewerId: professorId,
      status: { $in: ["Approved", "Rejected"] }
    })
      .populate("user", "name")
      .sort({ updatedAt: -1 })
      .limit(3)
      .lean();

    const allReviews = await Assignment.find({
      reviewerId: professorId
    })
      .populate("user", "name")
      .sort({ submittedAt: -1 })
      .lean();

    const now = new Date();

    function withDays(a) {
      const base = a.submittedAt || a.createdAt;
      const daysPending = Math.floor(
        (now - new Date(base)) / (1000 * 60 * 60 * 24)
      );
      return { ...a, daysPending };
    }

    res.render("professor-dashboard", {
      professorName: req.professor.name,
      counts: {
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
        total: totalReviewed
      },
      pendingAssignments: pendingAssignments.map(withDays),
      recentReviewed: recentReviewed.map(withDays),
      allReviews: allReviews.map(withDays)
    });

  } catch (err) {
    console.error("Professor dashboard error:", err);
    res.status(500).send("Server error");
  }
});

/* ================================
   PROFESSOR PROFILE (GET)
================================ */
router.get("/professor/profile", verifyProfessor, async (req, res) => {
  try {
    const professor = await Professor.findById(req.professor._id)
      .populate("department", "name");

    res.render("professor-profile", {
      professor: {
        name: professor.name,
        email: professor.email,
        phone: professor.phone,
        departmentName: professor.department?.name || ""
      }
    });
  } catch (err) {
    console.error("Professor profile error:", err);
    res.status(500).send("Server error");
  }
});

/* ================================
   PROFESSOR PROFILE UPDATE (POST)
================================ */
router.post("/professor/profile", verifyProfessor, async (req, res) => {
  try {
    const { phone, newPassword } = req.body;
    const professor = await Professor.findById(req.professor._id);

    if (phone !== undefined) {
      professor.phone = phone;
    }

    if (newPassword && newPassword.length >= 6) {
      professor.password = await bcrypt.hash(newPassword, 10);
    }

    await professor.save();

    res.json({
      message: newPassword
        ? "Password changed successfully. Please login with your new password."
        : "Profile updated successfully"
    });

  } catch (err) {
    console.error("Professor profile update error:", err);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

module.exports = router;
