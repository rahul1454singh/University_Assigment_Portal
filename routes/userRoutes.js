// routes/userRoutes.js
const express = require("express");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");

const { verifyAdmin } = require("../middleware/authMiddleware");
const Department = require("../models/Department");
const UserData = require("../models/UserData");

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

transporter.verify()
  .then(() => console.log("SMTP ready"))
  .catch(err => console.warn("SMTP verify failed:", err));
*/

/* =====================================================
   ❌ EMAIL FUNCTION DISABLED
   ===================================================== */
/*
async function sendUserEmail({ to, name = "", password = "", created = true }) {
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  const loginUrl = `${base}/login`;

  const subject = created
    ? "Your University Portal account has been created"
    : "Your University Portal account was updated";

  const html = `
    <p>Hello ${name}</p>
    <p>Email: ${to}</p>
    <p>Password: ${password || "(unchanged)"}</p>
    <p><a href="${loginUrl}">Login</a></p>
  `;

  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to,
    subject,
    html
  });
}
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

    await UserData.create({
      name,
      email,
      password: hash,
      phone,
      department,
      role
    });

    /* ❌ EMAIL SENDING DISABLED */
    // await sendUserEmail({ to: email, name, password: plain, created: true });

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

    /* ❌ EMAIL DISABLED */
    // await sendUserEmail({ to: email, name, password, created: false });

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
