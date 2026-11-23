const { createModel } = require('./documentModel');

const WITHDRAWAL_REASONS = ['consumption', 'waste', 'damage', 'correction', 'other'];
const IngredientWithdrawal = createModel('IngredientWithdrawal', {
  collection: 'ingredientwithdrawals',
  timestamps: true,
  defaults: { unitPrice: 0, totalValue: 0, reason: 'consumption', note: '', remainingAfter: 0, performedByName: '' },
  populate: { ingredient: 'Ingredient', performedBy: 'User' },
  dateFields: ['createdAt', 'updatedAt'],
  validate(withdrawal) {
    if (!withdrawal.ingredient || !withdrawal.ingredientName || !withdrawal.unit || !withdrawal.quantity || !withdrawal.performedBy) {
      throw new Error('Withdrawal is missing required fields');
    }
    if (!WITHDRAWAL_REASONS.includes(withdrawal.reason)) throw new Error('Invalid withdrawal reason');
  }
});
IngredientWithdrawal.WITHDRAWAL_REASONS = WITHDRAWAL_REASONS;
module.exports = IngredientWithdrawal;
