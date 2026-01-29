const express = require("express");
const router = express.Router();

const Assignment = require("../models/Assignment");
const Professor = require("../models/Professor");
const Notification = require("../models/Notification");
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
      allReviews: allReviews.map(withDays)
    });

  } catch (err) {
    console.error("Professor dashboard error:", err);
    res.status(500).send("Server error");
  }
});

/* ================================
   REVIEW ASSIGNMENT PAGE
================================ */

router.get(
  "/professor/assignments/:id/review",
  verifyProfessor,
  async (req, res) => {
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
  }
);

/* ================================
   APPROVE / REJECT
================================ */

router.post(
  "/professor/assignments/:id/decision",
  verifyProfessor,
  async (req, res) => {
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

    assignment.status = status;
    assignment.rejectionRemarks = status === "Rejected" ? remarks : "";

    await assignment.save();

    await Notification.create({
      userId: assignment.user,
      title: `Assignment ${status}`,
      message: `Your assignment "${assignment.title}" has been ${status.toLowerCase()}.`,
      assignmentId: assignment._id
    });

    res.json({ message: "Decision saved" });
  }
);

module.exports = router;
