const isValidObjectId = (value) => /^[a-f\d]{24}$/i.test(String(value || ''));

module.exports = { isValidObjectId };
