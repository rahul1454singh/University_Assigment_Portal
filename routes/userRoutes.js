// routes/userRoutes.js
const express = require("express");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");

const { verifyAdmin } = require("../middleware/authMiddleware");
const Department = require("../models/Department");
const UserData = require("../models/UserData");

const router = express.Router();

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

/**
 * Send account email for create / update.
 * - Shows Email and Password fields.
 * - For "created" it shows a message telling the user to login and upload assignments.
 * - For "updated": if password was changed, the email mentions it and shows the new password.
 *   If password not provided, the Password row shows "(unchanged)" so the email never looks blank.
 */
async function sendUserEmail({ to, name = "", password = "", created = true }) {
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  const loginUrl = `${base}/login`;

  // Subject varies depending on create vs update and whether password changed
  const subject = created
    ? "Your University Portal account has been created"
    : (password && password.trim()
        ? "Your University Portal password has been changed"
        : "Your University Portal account was updated");

  // Friendly intro text
  const intro = created
    ? `<p>Hello ${name}</p>
       <p>Your University Portal account has been <strong>created</strong>. Please sign in and upload your assignments.</p>`
    : `<p>Hello ${name}</p>
       <p>Your account was updated.${password && password.trim() ? " Your password was changed." : ""}</p>`;

  // Make password explicit: show provided password or "(unchanged)"
  const passwordDisplay = password && password.trim() ? password : "(unchanged)";

  // HTML body with clear Email / Password rows and a Login button
  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; padding:16px; color:#222;">
      ${intro}
      <table cellspacing="6" cellpadding="0" style="margin-top:8px;">
        <tr>
          <td style="font-weight:600">Email:</td>
          <td style="padding-left:8px">${to}</td>
        </tr>
        <tr>
          <td style="font-weight:600">Password:</td>
          <td style="padding-left:8px; font-family: 'Courier New', monospace;">${passwordDisplay}</td>
        </tr>
      </table>

      <div style="margin:18px 0;">
        <a href="${loginUrl}" style="
          display:inline-block;
          padding:10px 16px;
          border-radius:6px;
          text-decoration:none;
          font-weight:600;
          background-color:#2b6cb0;
          color:#fff;
        ">
          Login
        </a>
      </div>

      ${created ? `<p style="margin-top:8px;color:#444">After login you can upload assignments from the dashboard.</p>` : ""}
      <hr style="border:none;border-top:1px solid #eee;margin-top:18px"/>
      <small style="color:#777">If you didn't expect this email, contact your administrator.</small>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: process.env.FROM_EMAIL || process.env.SMTP_USER,
      to,
      subject,
      html
    });
  } catch (err) {
    console.error("Email send error:", err);
  }
}

const getDepartments = () => Department.find().sort({ name: 1 });

// Render create page
async function renderCreate(res, locals = {}) {
  const departments = await getDepartments();
  return res.render("create-user", { departments, ...locals });
}

// Render edit page
async function renderEdit(res, id, locals = {}) {
  const user = await UserData.findById(id).lean();
  const departments = await getDepartments();
  return res.render("edit-user", { user, departments, ...locals });
}

// Show create user form
router.get("/admin/users/create", verifyAdmin, async (req, res) => {
  try {
    await renderCreate(res, { error: null, success: null });
  } catch (err) {
    console.error("GET create user:", err);
    res.redirect("/admin/users");
  }
});

// Create user
router.post("/admin/users/create", verifyAdmin, async (req, res) => {
  try {
    const { name, email, phone, department, role, password } = req.body;

    if (!name || !email || !department || !role) {
      return await renderCreate(res, { error: "All fields are required", success: null });
    }

    if (await UserData.findOne({ email })) {
      return await renderCreate(res, { error: "Email already in use", success: null });
    }

    const plain = password && password.trim() ? password : Math.random().toString(36).slice(-8);
    const hash = await bcrypt.hash(plain, 10);

    await UserData.create({ name, email, password: hash, phone, department, role });

    // send email with credentials and login link
    await sendUserEmail({ to: email, name, password: plain, created: true });

    return await renderCreate(res, { success: "User created successfully.", error: null });
  } catch (err) {
    console.error("POST create user error:", err);
    return await renderCreate(res, { error: "Error creating user.", success: null });
  }
});

// List users
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

// Delete user
router.get("/admin/users/delete/:id", verifyAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const user = await UserData.findById(id).lean();
    if (!user) return res.redirect("/admin/users");

    // Students cannot be removed if assignments pending
    if (user.role === "Student") {
      const pending = await require("../models/Assignment").countDocuments({
        user: id,
        status: { $in: ["Draft", "Submitted"] }
      });

      if (pending > 0) {
        const users = await UserData.find().populate("department").sort({ name: 1 }).lean();
        return res.render("users-list", {
          users,
          error: "Student has pending submissions and cannot be deleted.",
          success: null
        });
      }
    }

    await UserData.findByIdAndDelete(id);
    return res.redirect("/admin/users?success=User+deleted+successfully");
  } catch (err) {
    console.error("DELETE user error:", err);
    return res.redirect("/admin/users");
  }
});

// Load edit form
router.get("/admin/users/edit/:id", verifyAdmin, async (req, res) => {
  try {
    const user = await UserData.findById(req.params.id).lean();
    if (!user) return res.redirect("/admin/users");
    const departments = await getDepartments();
    return res.render("edit-user", { user, departments, error: null, success: null });
  } catch (err) {
    console.error("GET edit user error:", err);
    return res.redirect("/admin/users");
  }
});

// Update user
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
    let plainPass = null;

    if (password && password.trim() !== "") {
      update.password = await bcrypt.hash(password, 10);
      plainPass = password;
    }

    await UserData.findByIdAndUpdate(id, update);

    // Send email if email changed or password changed
    if (userBefore.email !== email || plainPass) {
      await sendUserEmail({ to: email, name, password: plainPass || "", created: false });
    }

    return await renderEdit(res, id, { success: "User updated", error: null });
  } catch (err) {
    console.error("POST update user error:", err);
    return await renderEdit(res, req.params.id, { error: "Update error", success: null });
  }
});

module.exports = router;
