const { createModel } = require('./documentModel');

module.exports = createModel('Giveaway', {
  createdAtDefault: true,
  defaults: { image: '', imageUrl: '', imagePublicId: '', isActive: true },
  dateFields: ['createdAt', 'startDate', 'endDate'],
  validate(giveaway) {
    if (!giveaway.title || !giveaway.description || !giveaway.prize || !giveaway.startDate || !giveaway.endDate) {
      throw new Error('Giveaway is missing required fields');
    }
  }
});
