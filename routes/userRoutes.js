// routes/userRoutes.js
const express = require("express");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");

const { verifyAdmin } = require("../middleware/authMiddleware");
const Department = require("../models/Department");
const UserData = require("../models/UserData");
const Notification = require("../models/Notification"); // ✅ ADDED

const router = express.Router();

/* =====================================================
   ❌ SMTP DISABLED FOR RAILWAY
   Gmail SMTP is blocked and causes infinite loading
   ===================================================== */
/*
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || ""
  }
});
*/

/* =====================================================
   ❌ EMAIL FUNCTION DISABLED
   ===================================================== */
/*
async function sendUserEmail({ to, name = "", password = "", created = true }) {}
*/

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
    console.error("GET create user:", err);
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
      return await renderCreate(res, { error: "Email already in use", success: null });
    }

    const plain = password && password.trim()
      ? password
      : Math.random().toString(36).slice(-8);

    const hash = await bcrypt.hash(plain, 10);

    // ✅ CHANGED: store created user
    const newUser = await UserData.create({
      name,
      email,
      password: hash,
      phone,
      department,
      role
    });

    // =========================
    // 🔔 NOTIFICATION ADDED
    // =========================
    let message = `
<b>Note :-</b><br>
Your account has been created successfully.<br><br>

<b>Login Details</b><br>
Username: <b>${email}</b><br>
Password: <b>${plain}</b><br><br>

<a href="/login" style="display:inline-block;padding:8px 14px;background:#4b6cb7;color:#fff;border-radius:6px;text-decoration:none;font-weight:700;">
Login Now
</a>
<br><br>
`;

    if (role === "student") {
      message += `
<b>This is for Student</b><br>
Summary:<br>
This dashboard helps students view assignments, check submission status, and track approvals or rejections easily.
`;
    } else {
      message += `
<b>This is for Professor</b><br>
Summary:<br>
This dashboard helps professors review assignments, approve or reject submissions, and track overall progress.
`;
    }

    await Notification.create({
      userId: newUser._id,
      title: "Account Created Successfully",
      message
    });
    // =========================

    return await renderCreate(res, {
      success: "User created successfully.",
      error: null
    });

  } catch (err) {
    console.error("POST create user error:", err);
    return await renderCreate(res, {
      error: "Error creating user.",
      success: null
    });
  }
});

router.get("/admin/users", verifyAdmin, async (req, res) => {
  try {
    const users = await UserData.find()
      .populate("department")
      .sort({ name: 1 })
      .lean();

    const success = req.query.success
      ? decodeURIComponent(req.query.success)
      : null;

    return res.render("users-list", { users, success, error: null });
  } catch (err) {
    console.error("GET users error:", err);
    return res.status(500).send("Error fetching users");
  }
});

router.get("/admin/users/delete/:id", verifyAdmin, async (req, res) => {
  try {
    await UserData.findByIdAndDelete(req.params.id);
    return res.redirect("/admin/users?success=User+deleted+successfully");
  } catch (err) {
    console.error("DELETE user error:", err);
    return res.redirect("/admin/users");
  }
});

router.get("/admin/users/edit/:id", verifyAdmin, async (req, res) => {
  try {
    const user = await UserData.findById(req.params.id).lean();
    if (!user) return res.redirect("/admin/users");

    const departments = await getDepartments();
    return res.render("edit-user", {
      user,
      departments,
      error: null,
      success: null
    });
  } catch (err) {
    console.error("GET edit user error:", err);
    return res.redirect("/admin/users");
  }
});

router.post("/admin/users/update/:id", verifyAdmin, async (req, res) => {
  try {
    const { name, email, phone, department, role, password } = req.body;
    const update = { name, email, phone, department, role };

    if (password && password.trim()) {
      update.password = await bcrypt.hash(password, 10);
    }

    await UserData.findByIdAndUpdate(req.params.id, update);

    return await renderEdit(res, req.params.id, {
      success: "User updated",
      error: null
    });

  } catch (err) {
    console.error("POST update user error:", err);
    return await renderEdit(res, req.params.id, {
      error: "Update error",
      success: null
    });
  }
});

module.exports = router;
