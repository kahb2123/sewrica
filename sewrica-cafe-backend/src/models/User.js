const { createModel } = require('./documentModel');

module.exports = createModel('User', {
  uniqueFields: ['email'],
  createdAtDefault: true,
  defaults: {
    role: 'customer',
    isActive: true,
    extraPermissions: [],
    deniedPermissions: [],
    pageAccessOverrides: {}
  },
  dateFields: ['createdAt'],
  validate(user) {
    if (!user.name || !user.email || !user.password || !user.phone) {
      throw new Error('Name, email, password, and phone are required');
    }
    if (!['customer', 'admin', 'cashier', 'cook', 'delivery', 'waiter', 'supply_chain'].includes(user.role)) {
      throw new Error('Invalid user role');
    }
  }
});
