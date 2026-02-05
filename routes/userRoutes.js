// routes/userRoutes.js
const express = require("express");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");

const { verifyAdmin } = require("../middleware/authMiddleware");
const Department = require("../models/Department");
const UserData = require("../models/UserData");
const Notification = require("../models/Notification");

const router = express.Router();

/* =====================================================
   ❌ SMTP DISABLED FOR RAILWAY
   Gmail SMTP is blocked on Railway hosting
   ===================================================== */

// EMAIL IS INTENTIONALLY DISABLED ❌
// Notification system is used instead ✅

const getDepartments = () => Department.find().sort({ name: 1 });

async function renderCreate(res, locals = {}) {
  const departments = await getDepartments();
  return res.render("create-user", { departments, ...locals });
}

async function renderEdit(res, id, locals = {}) {
  const user = await UserData.findById(id).lean();
  const departments = await getDepartments();
  return res.render("edit-user", { user, departments, ...locals });
}

router.get("/admin/users/create", verifyAdmin, async (req, res) => {
  try {
    await renderCreate(res, { error: null, success: null });
  } catch (err) {
    console.error(err);
    res.redirect("/admin/users");
  }
});

router.post("/admin/users/create", verifyAdmin, async (req, res) => {
  try {
    const { name, email, phone, department, role, password } = req.body;

    if (!name || !email || !department || !role) {
      return await renderCreate(res, { error: "All fields are required", success: null });
    }

    if (await UserData.findOne({ email })) {
      return await renderCreate(res, { error: "Email already exists", success: null });
    }

    const plainPassword = password && password.trim()
      ? password
      : Math.random().toString(36).slice(-8);

    const hashed = await bcrypt.hash(plainPassword, 10);

    const newUser = await UserData.create({
      name,
      email,
      password: hashed,
      phone,
      department,
      role
    });

    // 🔔 NOTIFICATION MESSAGE (FIXED)
    let message = `
<b>Note:</b><br>
Your University Portal account has been created successfully.<br><br>

<b>Login Details</b><br>
Email: <b>${email}</b><br>
Password: <b>${plainPassword}</b><br><br>

<a href="/login" style="display:inline-block;padding:10px 16px;background:#4b6cb7;color:#fff;border-radius:6px;text-decoration:none;font-weight:700;">
Login to University Portal
</a>
<br><br>
`;

    if (role === "student") {
      message += `
<div style="color:red;font-weight:700;">
Student Dashboard Summary:<br>
You can upload assignments, view submission status, and track approval or rejection from professors.
</div>
`;
    } else {
      message += `
<div style="color:red;font-weight:700;">
Professor Dashboard Summary:<br>
You can review student assignments, approve or reject submissions, and monitor overall progress.
</div>
`;
    }

    await Notification.create({
      userId: newUser._id,
      title: "University Account Created",
      message
    });

    return await renderCreate(res, {
      success: "User created successfully.",
      error: null
    });

  } catch (err) {
    console.error(err);
    return await renderCreate(res, {
      error: "Error creating user",
      success: null
    });
  }
});

router.get("/admin/users", verifyAdmin, async (req, res) => {
  const users = await UserData.find().populate("department").lean();
  res.render("users-list", { users, success: null, error: null });
});

module.exports = router;
