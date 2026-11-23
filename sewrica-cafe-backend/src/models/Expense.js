const { createModel } = require('./documentModel');

module.exports = createModel('Expense', {
  timestamps: true,
  populate: { recordedBy: 'User', approvedBy: 'User' },
  dateFields: ['createdAt', 'updatedAt', 'expenseDate'],
  defaults: {
    currency: 'ETB',
    paymentMethod: 'cash',
    supplier: '',
    receiptNumber: '',
    notes: '',
    approved: false,
    approvedBy: null
  },
  validate(expense) {
    if (!expense.category || !expense.description || !expense.amount || !expense.expenseDate || !expense.recordedBy) {
      throw new Error('Expense is missing required fields');
    }
    if (!['ingredients', 'utilities', 'rent', 'marketing', 'staff', 'maintenance', 'supplies', 'other'].includes(expense.category)) {
      throw new Error('Invalid expense category');
    }
    if (!['cash', 'card', 'bank_transfer', 'mobile_money'].includes(expense.paymentMethod)) {
      throw new Error('Invalid expense payment method');
    }
    if (Number(expense.amount) < 0.01) throw new Error('Expense amount must be greater than 0');
  }
});
