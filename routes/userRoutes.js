// routes/userRoutes.js
const express = require("express");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");

const { verifyAdmin } = require("../middleware/authMiddleware");
const Department = require("../models/Department");
const UserData = require("../models/UserData");
const Assignment = require("../models/Assignment");

const router = express.Router();

/* -------------------- mailer -------------------- */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587", 10),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || ""
  }
});

transporter.verify()
  .then(() => console.log("SMTP ready"))
  .catch(err => console.warn("SMTP verify failed:", err && err.message ? err.message : err));

async function sendCredentialsEmail({ to, name = "", email = "", password = "" }) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn("SMTP not configured — skipping email");
    return false;
  }

  const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  const html = `
    <div style="font-family:Arial,sans-serif;padding:12px">
      <h3>Hello ${name}</h3>
      <p>Your University Portal account has been created/updated.</p>
      <p><strong>Email:</strong> ${email}<br><strong>Password:</strong> ${password}</p>
      <p>Please login and change your password.</p>
      <p><a href="${appUrl}/login">Login</a></p>
    </div>
  `;

  const mailOptions = {
    from: process.env.FROM_EMAIL || process.env.SMTP_USER,
    to,
    subject: "University Portal - Account credentials",
    html
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Credentials email sent to ${to} — id: ${info && info.messageId}`);
    return true;
  } catch (err) {
    console.error("sendMail failed:", err && err.message ? err.message : err);
    return false;
  }
}


const fetchDepartments = () => Department.find().sort({ name: 1 });
const renderCreate = (res, locals = {}) => fetchDepartments().then(departments => res.render("create-user", { departments, ...locals }));
const renderEdit = async (res, id, locals = {}) => {
  const user = await UserData.findById(id).lean();
  const departments = await fetchDepartments();
  return res.render("edit-user", { user, departments, ...locals });
};

/* -------------------- routes -------------------- */

// GET create user page
router.get("/admin/users/create", verifyAdmin, async (req, res) => {
  try {
    await renderCreate(res, { error: null, success: null });
  } catch (err) {
    console.error("GET create user:", err);
    res.redirect("/admin/users");
  }
});

// POST create user
router.post("/admin/users/create", verifyAdmin, async (req, res) => {
  try {
    const { name, email, phone, department, role, password } = req.body;
    if (!name || !email || !department || !role) {
      return await renderCreate(res, { error: "All fields are required", success: null });
    }

    if (await UserData.findOne({ email })) {
      return await renderCreate(res, { error: "Email already in use", success: null });
    }

    const plainPassword = (password && password.trim()) ? password : Math.random().toString(36).slice(-8);
    const hashed = await bcrypt.hash(plainPassword, 10);

    await UserData.create({ name, email, password: hashed, phone, department, role });

    try {
      await sendCredentialsEmail({ to: email, name, email, password: plainPassword });
    } catch (mailErr) {
      console.error("Failed to send credentials email:", mailErr);
    }

    return await renderCreate(res, { success: "User created successfully.", error: null });
  } catch (err) {
    console.error("POST create user error:", err);
    return await renderCreate(res, { error: "Error creating user.", success: null });
  }
});

// LIST users
router.get("/admin/users", verifyAdmin, async (req, res) => {
  try {
    const users = await UserData.find().populate("department").sort({ name: 1 }).lean();
    const success = req.query.success ? decodeURIComponent(req.query.success) : null;
    return res.render("users-list", { users, success, error: null });
  } catch (err) {
    console.error("GET users error:", err);
    return res.status(500).send("Error fetching users");
  }
});

// DELETE user 
router.get("/admin/users/delete/:id", verifyAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const user = await UserData.findById(id).lean();
    if (!user) return res.redirect("/admin/users");

    if (user.role === "Student") {
      const pending = await Assignment.countDocuments({ user: id, status: { $in: ["Draft", "Submitted"] } });
      if (pending > 0) {
        const users = await UserData.find().populate("department").sort({ name: 1 }).lean();
        return res.render("users-list", { users, error: "Student has pending submissions and cannot be deleted.", success: null });
      }
    }

    await UserData.findByIdAndDelete(id);
    return res.redirect("/admin/users?success=User+deleted+successfully");
  } catch (err) {
    console.error("DELETE user error:", err);
    return res.redirect("/admin/users");
  }
});

// EDIT page
router.get("/admin/users/edit/:id", verifyAdmin, async (req, res) => {
  try {
    const user = await UserData.findById(req.params.id).lean();
    if (!user) return res.redirect("/admin/users");
    const departments = await fetchDepartments();
    return res.render("edit-user", { user, departments, error: null, success: null });
  } catch (err) {
    console.error("GET edit user error:", err);
    return res.redirect("/admin/users");
  }
});

// UPDATE user if email or password changed, notify user
router.post("/admin/users/update/:id", verifyAdmin, async (req, res) => {
  try {
    const { name, email, phone, department, role, password } = req.body;
    const id = req.params.id;

    if (!name || !email || !department || !role) {
      return await renderEdit(res, id, { error: "All fields are required", success: null });
    }

    const userBefore = await UserData.findById(id).lean();
    if (!userBefore) return res.redirect("/admin/users");

    const update = { name, email, phone, department, role };
    let plainPasswordToSend = null;

    if (password && password.trim() !== "") {
      update.password = await bcrypt.hash(password, 10);
      plainPasswordToSend = password;
    }

    await UserData.findByIdAndUpdate(id, update);

    if (userBefore.email !== email || plainPasswordToSend) {
      try {
        await sendCredentialsEmail({
          to: email,
          name,
          email,
          password: plainPasswordToSend || "(unchanged - email updated)"
        });
      } catch (mailErr) {
        console.error("Failed to send update email:", mailErr);
      }
    }

    return await renderEdit(res, id, { success: "User updated", error: null });
  } catch (err) {
    console.error("POST update user error:", err);
    return await renderEdit(res, req.params.id, { error: "Update error", success: null });
  }
});

module.exports = router;
