
const Department = require('../models/Department');
const User = require('../models/UserData');

function buildFilter(query = {}) {
  const q = typeof query.q === 'string' ? query.q.trim() : '';
  const type = typeof query.type === 'string' ? query.type.trim() : '';
  const filter = {};
  if (q) filter.name = { $regex: q, $options: 'i' };
  if (type) filter.type = type;
  return { filter, q, type };
}


 // Add user counts to each department .
  
async function withUserCounts(departments = []) {
  return Promise.all(departments.map(async (dep) => {
    const userCount = await User.countDocuments({ department: dep._id });
    return { ...dep, userCount };
  }));
}


 // GET /admin/departments
 
exports.listDepartments = async (req, res) => {
  try {
    const { filter, q, type } = buildFilter(req.query);
    const departments = await Department.find(filter).lean();
    const departmentsWithCounts = await withUserCounts(departments);

    return res.render('departments-list', {
      departments: departmentsWithCounts,
      q,
      type,
      error: null
    });
  } catch (err) {
    console.error('Error listing departments:', err);
    return res.render('departments-list', {
      departments: [],
      q: '',
      type: '',
      error: 'Server error'
    });
  }
};
/* DELETE /admin/departments/:id */
exports.deleteDepartment = async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ message: 'Department id required' });

    const usersCount = await User.countDocuments({ department: id });
    if (usersCount > 0) {
      return res.status(400).json({
        message: `Cannot delete department: ${usersCount} user(s) are associated.`
      });
    }

    const deleted = await Department.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: 'Department not found' });

    return res.json({ message: 'Department deleted' });
  } catch (err) {
    console.error('Error deleting department:', err);
    return res.status(500).json({ message: 'Server error while deleting department' });
  }
};
