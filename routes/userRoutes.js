const express = require("express");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");

const { verifyAdmin } = require("../middleware/authMiddleware");
const Department = require("../models/Department");
const UserData = require("../models/UserData");
const Notification = require("../models/Notification");

const router = express.Router();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

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

    const newUser = await UserData.create({
      name,
      email,
      password: plainPassword,
      phone,
      department,
      role
    });

    let summaryText = role === "student" 
      ? "You can upload assignments, view submission status, and track approval or rejection from professors."
      : "You can review student assignments, approve or reject submissions, and monitor overall progress.";

    // ✅ FIXED LOGIN URL (ONLY CHANGE)
    const loginUrl = `https://violent-gerrilee-university-9c3c3108.koyeb.app/login`;

    let messageHTML = `
      <div style="font-family: sans-serif; color: #333; max-width: 600px; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
        <h2 style="color: #4b6cb7;">Welcome to University Portal</h2>
        <p>Hello <b>${name}</b>,</p>
        <p>Your account has been created successfully. Here are your login credentials:</p>
        <div style="background: #f4f7fe; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 5px 0;"><b>Email:</b> ${email}</p>
          <p style="margin: 5px 0;"><b>Password:</b> ${plainPassword}</p>
        </div>
        <p><b>Dashboard Summary:</b></p>
        <p style="color: #666;">${summaryText}</p>
        <br>
        <a href="${loginUrl}" style="display:inline-block;padding:12px 20px;background:#4b6cb7;color:#fff;border-radius:6px;text-decoration:none;font-weight:700;">
          Login to Your Account
        </a>
      </div>
    `;

    try {
      await transporter.sendMail({
        from: `"University Admin" <${process.env.FROM_EMAIL}>`,
        to: email,
        subject: "Your University Account is Ready",
        html: messageHTML,
      });
    } catch (mailErr) {
      console.error("Email Error:", mailErr);
    }

    await Notification.create({
      userId: newUser._id,
      title: "University Account Created",
      message: messageHTML
    });

    return await renderCreate(res, {
      success: "User created successfully and email sent!",
      error: null
    });

  } catch (err) {
    console.error(err);
    return await renderCreate(res, { error: "Error creating user", success: null });
  }
});

router.get("/admin/users", verifyAdmin, async (req, res) => {
  try {
    const users = await UserData.find().populate("department").lean();
    res.render("users-list", { users, success: req.query.success || null, error: req.query.error || null });
  } catch (err) {
    res.redirect("/admin/dashboard");
  }
});

router.post("/admin/users/update/:id", verifyAdmin, async (req, res) => {
  try {
    const { name, email, department, role, password } = req.body;
    
    const user = await UserData.findById(req.params.id);
    if (!user) return res.redirect("/admin/users?error=User not found");

    user.name = name;
    user.email = email;
    user.department = department;
    user.role = role;

    if (password && password.trim() !== "") {
      user.password = password;
    }

    await user.save();
    res.redirect("/admin/users?success=User updated successfully");
  } catch (err) {
    res.redirect("/admin/users?error=Error updating user");
  }
});

router.get("/admin/users/delete/:id", verifyAdmin, async (req, res) => {
  try {
    await UserData.findByIdAndDelete(req.params.id);
    res.redirect("/admin/users?success=User deleted successfully");
  } catch (err) {
    res.redirect("/admin/users?error=Error deleting user");
  }
});

module.exports = router;
