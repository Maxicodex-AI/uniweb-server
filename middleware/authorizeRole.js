// middleware/authorizeRole.js

// Helper to check if a user is any kind of admin
function isAnyAdmin(role) {
  return role === 'admin' || role === 'faculty_admin' || role === 'department_admin';
}

module.exports = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    // Expand 'any_admin' shorthand if used
    const expanded = allowedRoles.flatMap(r =>
      r === 'any_admin' ? ['admin', 'faculty_admin', 'department_admin'] : [r]
    );

    if (!expanded.includes(req.user.role)) {
      return res.status(403).json({
        message: `Access denied: requires one of [${expanded.join(', ')}]`,
      });
    }

    next();
  };
};

module.exports.isAnyAdmin = isAnyAdmin;