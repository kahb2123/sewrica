const { createModel } = require('./documentModel');

module.exports = createModel('Ingredient', {
  uniqueFields: ['name'],
  timestamps: true,
  defaults: {
    quantity: 0,
    unitPrice: 0,
    reorderLevel: 0,
    supplier: '',
    purchases: [],
    isArchived: false,
    archivedByName: '',
    archiveReason: ''
  },
  populate: { purchases: 'User', archivedBy: 'User' },
  dateFields: ['createdAt', 'updatedAt', 'archivedAt', 'purchases.purchasedAt'],
  validate(ingredient) {
    if (!ingredient.name || !ingredient.unit) throw new Error('Name and unit are required');
    if (!['piece', 'kg', 'g', 'liter', 'ml', 'pack', 'box'].includes(ingredient.unit)) {
      throw new Error('Invalid ingredient unit');
    }
    if (Number(ingredient.quantity) < 0 || Number(ingredient.unitPrice) < 0 || Number(ingredient.reorderLevel) < 0) {
      throw new Error('Ingredient values cannot be negative');
    }
  }
});
