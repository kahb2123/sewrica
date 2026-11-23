const { createModel } = require('./documentModel');

module.exports = createModel('MenuItem', {
  uniqueFields: ['name'],
  defaults: {
    image: 'default-food.jpg',
    rating: 4.0,
    spiceLevel: '🌶️',
    prepTime: '15 min',
    isVegetarian: false,
    isSpicy: false,
    isPopular: false,
    isSignature: false,
    isAvailable: true,
    stockQuantity: 100,
    reorderLevel: 10,
    ingredients: []
  },
  validate(item) {
    if (!item.name || !item.nameAm || !item.description || !item.fullDescription || item.price === undefined || !item.category) {
      throw new Error('Menu item is missing required fields');
    }
    if (Number(item.price) < 0 || Number(item.stockQuantity) < 0 || Number(item.reorderLevel) < 0) {
      throw new Error('Menu item values cannot be negative');
    }
  }
});
