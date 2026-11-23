const { createModel } = require('./documentModel');

module.exports = createModel('Counter', {
  collection: 'counters',
  defaults: { sequence: 0 }
});
