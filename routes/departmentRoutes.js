// routes/departmentRoute.js
const express = require("express");
const { verifyAdmin } = require("../middleware/authMiddleware");
const Department = require("../models/Department");
const UserData = require("../models/UserData");

const router = express.Router();


const buildFilter = (query) => {
  const { type, q } = query || {};
  const filter = {};
  if (type && type !== "") filter.type = type;
  if (q && q.trim() !== "") filter.name = { $regex: q.trim(), $options: "i" };
  return filter;
};

const attachUserCounts = async (departments) => {
  return Promise.all(
    departments.map(async (d) => {
      const userCount = await UserData.countDocuments({ department: d._id });
      return {
        _id: d._id,
        name: d.name,
        type: d.type,
        address: d.address,
        userCount
      };
    })
  );
};

const renderDepartmentsList = async (res, opts = {}) => {
  const { q = "", type = "", error = null } = opts;
  const filter = buildFilter({ q, type });
  const departments = await Department.find(filter).sort({ name: 1 });
  const departmentsWithUserCount = await attachUserCounts(departments);
  return res.render("departments-list", {
    departments: departmentsWithUserCount,
    q,
    type,
    error
  });
};

/* Routes */

// show create page
router.get("/admin/departments/create", verifyAdmin, (req, res) => {
  res.render("create-department", { error: null, success: null });
});

// create department
router.post("/admin/departments/create", verifyAdmin, async (req, res) => {
  const { name, type, address } = req.body;
  if (!name || !type || !address) {
    return res.render("create-department", { error: "All fields are required", success: null });
  }

  try {
    await Department.create({ name, type, address });
    return res.render("create-department", { success: "Department created successfully!", error: null });
  } catch (err) {
    console.error("Create department error:", err);
    return res.render("create-department", { error: "Error creating department", success: null });
  }
});

// list departments (supports ?q and ?type)
router.get("/admin/departments", verifyAdmin, async (req, res) => {
  try {
    await renderDepartmentsList(res, { q: req.query.q || "", type: req.query.type || "" });
  } catch (err) {
    console.error("Error fetching departments:", err);
    res.send("Error fetching departments");
  }
});

// show edit page
router.get("/admin/departments/edit/:id", verifyAdmin, async (req, res) => {
  try {
    const dep = await Department.findById(req.params.id);
    if (!dep) return res.redirect("/admin/departments");
    res.render("edit-department", { department: dep, error: null, success: null });
  } catch (err) {
    console.error("Edit department page error:", err);
    res.redirect("/admin/departments");
  }
});

// update department
router.post("/admin/departments/update/:id", verifyAdmin, async (req, res) => {
  const { name, type, address } = req.body;
  if (!name || !type || !address) {
    const dep = await Department.findById(req.params.id);
    return res.render("edit-department", { department: dep, error: "All fields are required", success: null });
  }

  try {
    await Department.findByIdAndUpdate(req.params.id, { name, type, address });
    const dep = await Department.findById(req.params.id);
    return res.render("edit-department", { department: dep, success: "Department updated", error: null });
  } catch (err) {
    console.error("Update department error:", err);
    const dep = await Department.findById(req.params.id);
    return res.render("edit-department", { department: dep, error: "Update error", success: null });
  }
});

// legacy server-side delete (re-renders with error when users exist)
router.get("/admin/departments/delete/:id", verifyAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const userCount = await UserData.countDocuments({ department: id });

    if (userCount > 0) {
      // show departments list with error
      return await renderDepartmentsList(res, { error: "Department has users and cannot be deleted." });
    }

    await Department.findByIdAndDelete(id);
    return res.redirect("/admin/departments");
  } catch (err) {
    console.error("GET delete department error:", err);
    return res.redirect("/admin/departments");
  }
});

// API DELETE 
router.delete("/admin/departments/:id", verifyAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ message: "Department id required" });

    const usersCount = await UserData.countDocuments({ department: id });
    if (usersCount > 0) {
      return res.status(400).json({ message: `Cannot delete department: ${usersCount} user(s) are associated.` });
    }

    const deleted = await Department.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: "Department not found" });

    return res.json({ message: "Department deleted" });
  } catch (err) {
    console.error("DELETE department error:", err);
    return res.status(500).json({ message: "Server error while deleting department" });
  }
});

module.exports = router;
