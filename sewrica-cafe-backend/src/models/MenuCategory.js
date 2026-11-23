const { createModel } = require('./documentModel');

module.exports = createModel('MenuCategory', {
  uniqueFields: ['value'],
  timestamps: true,
  validate(category) {
    if (!category.name || !category.value) throw new Error('Name and value are required');
  }
});
