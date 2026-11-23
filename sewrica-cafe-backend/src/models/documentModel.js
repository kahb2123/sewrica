const crypto = require('crypto');
const database = require('../database');

const modelRegistry = new Map();
const DATE_FIELDS = new Set([
  'createdAt', 'updatedAt', 'paidAt', 'processedAt', 'startDate', 'endDate',
  'expenseDate', 'purchasedAt', 'archivedAt', 'lotteryPrizeClaimedAt',
  'chefAcceptedAt', 'chefRejectedAt', 'deliveryAcceptedAt', 'deliveryRejectedAt',
  'cookingStartedAt', 'cookingCompletedAt', 'deliveryStartedAt',
  'deliveryCompletedAt', 'waiterCompletedAt', 'changedAt'
]);

const clone = (value) => {
  if (value === undefined || value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(clone);
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, clone(child)]));
};

const objectId = () => crypto.randomBytes(12).toString('hex');
const isValidObjectId = (value) => /^[a-f\d]{24}$/i.test(String(value || ''));
const isDateLike = (value) => value instanceof Date || (
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)
);

const revive = (value, key = '', customDateFields = []) => {
  if (Array.isArray(value)) return value.map((entry) => revive(entry, key, customDateFields));
  if (!value || typeof value !== 'object') {
    if ((DATE_FIELDS.has(key) || /At$/.test(key) || customDateFields.includes(key)) && isDateLike(value)) {
      return new Date(value);
    }
    return value;
  }
  const result = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    result[childKey] = revive(childValue, childKey, customDateFields);
  }
  return result;
};

const parseRow = (value) => {
  if (typeof value === 'string') return revive(JSON.parse(value));
  return revive(value);
};

const getPath = (value, path) => {
  const parts = path.split('.');
  let current = [value];
  for (const part of parts) {
    current = current.flatMap((entry) => {
      if (Array.isArray(entry)) return entry.map((item) => item == null ? undefined : item[part]);
      return entry == null ? [undefined] : [entry[part]];
    });
  }
  return current.length === 1 ? current[0] : current;
};

const setPath = (value, path, nextValue) => {
  const parts = path.split('.');
  let current = value;
  for (const part of parts.slice(0, -1)) {
    if (!current[part] || typeof current[part] !== 'object') current[part] = {};
    current = current[part];
  }
  current[parts[parts.length - 1]] = nextValue;
};

const unsetPath = (value, path) => {
  const parts = path.split('.');
  let current = value;
  for (const part of parts.slice(0, -1)) {
    if (!current || typeof current !== 'object') return;
    current = current[part];
  }
  if (current && typeof current === 'object') delete current[parts[parts.length - 1]];
};

const equal = (left, right) => {
  if (left instanceof Date || right instanceof Date) {
    const a = new Date(left).getTime();
    const b = new Date(right).getTime();
    return Number.isFinite(a) && Number.isFinite(b) && a === b;
  }
  if (left === right) return true;
  if (left == null || right == null) return left == null && right == null;
  if (typeof left === 'object' && typeof right === 'object') {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  return String(left) === String(right);
};

const compare = (left, right) => {
  if (left === undefined || right === undefined) return null;
  if (left === null) return right === null ? 0 : -1;
  if (right === null) return 1;
  const a = left instanceof Date || isDateLike(left) ? new Date(left).getTime() : left;
  const b = right instanceof Date || isDateLike(right) ? new Date(right).getTime() : right;
  if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : a > b ? 1 : 0;
  const aa = typeof a === 'string' && !Number.isNaN(Number(a)) ? Number(a) : a;
  const bb = typeof b === 'string' && !Number.isNaN(Number(b)) ? Number(b) : b;
  return aa < bb ? -1 : aa > bb ? 1 : 0;
};

const matchCondition = (value, condition) => {
  if (condition instanceof RegExp) {
    return (Array.isArray(value) ? value : [value]).some((entry) => condition.test(String(entry || '')));
  }
  if (!condition || typeof condition !== 'object' || condition instanceof Date || Array.isArray(condition)) {
    if (Array.isArray(value) && !Array.isArray(condition)) return value.some((entry) => equal(entry, condition));
    return equal(value, condition);
  }

  return Object.entries(condition).every(([operator, expected]) => {
    const candidates = Array.isArray(value) ? value : [value];
    switch (operator) {
      case '$eq': return candidates.some((entry) => equal(entry, expected));
      case '$ne': return expected === null
        ? value !== null && value !== undefined
        : !candidates.some((entry) => equal(entry, expected));
      case '$in': return candidates.some((entry) => expected.some((candidate) => equal(entry, candidate)));
      case '$nin': return !candidates.some((entry) => expected.some((candidate) => equal(entry, candidate)));
      case '$gt': return candidates.some((entry) => compare(entry, expected) > 0);
      case '$gte': return candidates.some((entry) => {
        const order = compare(entry, expected);
        return order !== null && order >= 0;
      });
      case '$lt': return candidates.some((entry) => compare(entry, expected) < 0);
      case '$lte': return candidates.some((entry) => {
        const order = compare(entry, expected);
        return order !== null && order <= 0;
      });
      case '$exists': return expected ? value !== undefined : value === undefined;
      case '$regex': {
        const regex = expected instanceof RegExp
          ? expected
          : new RegExp(expected, condition.$options || '');
        return candidates.some((entry) => regex.test(String(entry || '')));
      }
      case '$options': return true;
      case '$elemMatch': return candidates.some((entry) =>
        Array.isArray(entry) ? entry.some((item) => matches(item, expected)) : matches(entry, expected));
      case '$not': return !matchCondition(value, expected);
      default: return false;
    }
  });
};

const matches = (document, query = {}) => Object.entries(query).every(([key, condition]) => {
  if (key === '$or') return condition.some((entry) => matches(document, entry));
  if (key === '$and') return condition.every((entry) => matches(document, entry));
  if (key === '$nor') return !condition.some((entry) => matches(document, entry));
  return matchCondition(getPath(document, key), condition);
});

const applyUpdate = (document, update) => {
  const operators = Object.keys(update || {}).filter((key) => key.startsWith('$'));
  if (!operators.length) {
    for (const [key, value] of Object.entries(update || {})) setPath(document, key, clone(value));
    return document;
  }
  for (const [operator, values] of Object.entries(update)) {
    if (operator === '$set' || operator === '$setOnInsert') {
      for (const [path, value] of Object.entries(values)) setPath(document, path, clone(value));
    } else if (operator === '$unset') {
      for (const path of Object.keys(values)) unsetPath(document, path);
    } else if (operator === '$inc') {
      for (const [path, amount] of Object.entries(values)) {
        setPath(document, path, (Number(getPath(document, path)) || 0) + Number(amount));
      }
    } else if (operator === '$push' || operator === '$addToSet') {
      for (const [path, value] of Object.entries(values)) {
        const array = getPath(document, path) || [];
        const entries = value && value.$each ? value.$each : [value];
        const toAdd = operator === '$addToSet'
          ? entries.filter((entry) => !array.some((existing) => equal(existing, entry)))
          : entries;
        const next = [...array, ...clone(toAdd)];
        if (value && value.$slice !== undefined) {
          setPath(document, path, value.$slice < 0 ? next.slice(value.$slice) : next.slice(0, value.$slice));
        } else {
          setPath(document, path, next);
        }
      }
    } else if (operator === '$pull') {
      for (const [path, condition] of Object.entries(values)) {
        const array = getPath(document, path) || [];
        setPath(document, path, array.filter((entry) => {
          if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
            return !matches(entry, condition);
          }
          return !equal(entry, condition);
        }));
      }
    } else if (operator === '$min' || operator === '$max') {
      for (const [path, value] of Object.entries(values)) {
        const current = getPath(document, path);
        const order = compare(current, value);
        if (current === undefined || (operator === '$min' ? order > 0 : order < 0)) setPath(document, path, clone(value));
      }
    }
  }
  return document;
};

const project = (document, selection) => {
  if (!selection) return clone(document);
  const fields = Array.isArray(selection)
    ? selection
    : String(selection).split(/\s+/).filter(Boolean);
  const excludes = fields.filter((field) => field.startsWith('-')).map((field) => field.slice(1));
  const includes = fields.filter((field) => !field.startsWith('+') && !field.startsWith('-'));
  let result;
  if (includes.length) {
    result = {};
    for (const field of includes) {
      const value = getPath(document, field);
      if (value !== undefined) setPath(result, field, clone(value));
    }
    if (!fields.includes('-_id') && document._id !== undefined) result._id = document._id;
  } else {
    result = clone(document);
  }
  for (const field of excludes) unsetPath(result, field);
  return result;
};

const resolveExpression = (expression, document) => {
  if (typeof expression === 'string') {
    if (expression.startsWith('$$')) return undefined;
    return expression.startsWith('$') ? getPath(document, expression.slice(1)) : expression;
  }
  if (expression instanceof Date || expression === null || typeof expression !== 'object') return expression;
  if (Array.isArray(expression)) return expression.map((item) => resolveExpression(item, document));

  const [operator, operand] = Object.entries(expression)[0] || [];
  const values = Array.isArray(operand)
    ? operand.map((item) => resolveExpression(item, document))
    : undefined;
  switch (operator) {
    case '$literal': return operand;
    case '$ifNull': {
      const options = values || [resolveExpression(operand, document)];
      return options.find((value) => value !== null && value !== undefined);
    }
    case '$eq': return equal(values[0], values[1]);
    case '$ne': return !equal(values[0], values[1]);
    case '$gt': return compare(values[0], values[1]) > 0;
    case '$gte': return compare(values[0], values[1]) >= 0;
    case '$lt': return compare(values[0], values[1]) < 0;
    case '$lte': return compare(values[0], values[1]) <= 0;
    case '$in': return (Array.isArray(values[1]) ? values[1] : []).some((value) => equal(values[0], value));
    case '$and': return values.every(Boolean);
    case '$or': return values.some(Boolean);
    case '$not': return !resolveExpression(operand[0], document);
    case '$cond': {
      const args = Array.isArray(operand) ? operand : [operand.if, operand.then, operand.else];
      return resolveExpression(args[0], document)
        ? resolveExpression(args[1], document)
        : resolveExpression(args[2], document);
    }
    case '$multiply': return values.reduce((total, value) => total * (Number(value) || 0), 1);
    case '$subtract': {
      const [left, right] = values;
      return left instanceof Date || right instanceof Date || isDateLike(left) || isDateLike(right)
        ? new Date(left).getTime() - new Date(right).getTime()
        : Number(left) - Number(right);
    }
    case '$divide': return Number(values[0]) / Number(values[1]);
    case '$round': {
      const precision = Number(values[1]) || 0;
      const factor = 10 ** precision;
      return Math.round(Number(values[0]) * factor) / factor;
    }
    case '$arrayElemAt': {
      const array = Array.isArray(values[0]) ? values[0] : [];
      return array[Number(values[1])];
    }
    case '$size': return Array.isArray(resolveExpression(operand, document))
      ? resolveExpression(operand, document).length : null;
    case '$toLong': return Number(resolveExpression(operand, document));
    case '$dateToString': {
      const { format, date, timezone } = operand;
      const dateValue = resolveExpression(date, document);
      if (!dateValue) return null;
      const parsed = new Date(dateValue);
      const offset = typeof timezone === 'string' && /^\+\d{2}:\d{2}$/.test(timezone)
        ? Number(timezone.slice(1, 3)) * 60 + Number(timezone.slice(4, 6))
        : 0;
      const shifted = new Date(parsed.getTime() + offset * 60000);
      const parts = {
        '%Y': String(shifted.getUTCFullYear()),
        '%m': String(shifted.getUTCMonth() + 1).padStart(2, '0'),
        '%d': String(shifted.getUTCDate()).padStart(2, '0'),
        '%H': String(shifted.getUTCHours()).padStart(2, '0'),
        '%M': String(shifted.getUTCMinutes()).padStart(2, '0'),
        '%S': String(shifted.getUTCSeconds()).padStart(2, '0')
      };
      return Object.entries(parts).reduce((result, [token, replacement]) =>
        result.replace(new RegExp(token, 'g'), replacement), format);
    }
    default: {
      const result = {};
      for (const [key, value] of Object.entries(expression)) {
        result[key] = resolveExpression(value, document);
      }
      return result;
    }
  }
};

const aggregate = async (documents, pipeline, model) => {
  let rows = documents.map(clone);
  for (const stage of pipeline) {
    const [operator, spec] = Object.entries(stage)[0] || [];
    if (operator === '$match') {
      rows = rows.filter((row) => matches(row, spec));
    } else if (operator === '$sort') {
      const entries = Object.entries(spec);
      rows.sort((a, b) => {
        for (const [field, direction] of entries) {
          const result = compare(getPath(a, field), getPath(b, field)) || 0;
          if (result) return result * direction;
        }
        return 0;
      });
    } else if (operator === '$limit') {
      rows = rows.slice(0, spec);
    } else if (operator === '$skip') {
      rows = rows.slice(spec);
    } else if (operator === '$unwind') {
      const path = typeof spec === 'string' ? spec : spec.path;
      const field = path.replace(/^\$/, '');
      const preserve = typeof spec === 'object' && spec.preserveNullAndEmptyArrays;
      rows = rows.flatMap((row) => {
        const value = getPath(row, field);
        if (Array.isArray(value) && value.length) {
          return value.map((entry) => {
            const expanded = clone(row);
            setPath(expanded, field, entry);
            return expanded;
          });
        }
        if (preserve) return [row];
        return [];
      });
    } else if (operator === '$lookup') {
      const foreignModel = modelRegistry.get(spec.from);
      const foreignRows = foreignModel ? await foreignModel._all() : [];
      rows = rows.map((row) => {
        const localValue = getPath(row, spec.localField);
        const matchesFound = foreignRows.filter((foreign) =>
          equal(getPath(foreign, spec.foreignField), localValue));
        const expanded = clone(row);
        setPath(expanded, spec.as, matchesFound);
        return expanded;
      });
    } else if (operator === '$addFields' || operator === '$set') {
      rows = rows.map((row) => {
        const expanded = clone(row);
        for (const [field, expression] of Object.entries(spec)) {
          setPath(expanded, field, resolveExpression(expression, row));
        }
        return expanded;
      });
    } else if (operator === '$project') {
      rows = rows.map((row) => {
        const include = Object.entries(spec).filter(([, value]) => value === 1 || value === true);
        const hasInclude = include.length > 0 || Object.values(spec).some((value) => value !== 0 && value !== false);
        const projected = hasInclude ? {} : clone(row);
        for (const [field, expression] of Object.entries(spec)) {
          if (expression === 0 || expression === false) unsetPath(projected, field);
          else if (expression === 1 || expression === true) {
            const value = getPath(row, field);
            if (value !== undefined) setPath(projected, field, clone(value));
          } else {
            setPath(projected, field, resolveExpression(expression, row));
          }
        }
        if (hasInclude && spec._id !== 0 && row._id !== undefined) projected._id = row._id;
        return projected;
      });
    } else if (operator === '$group') {
      const groups = new Map();
      for (const row of rows) {
        const id = resolveExpression(spec._id, row);
        const key = JSON.stringify(id);
        if (!groups.has(key)) {
          const entry = { _id: id };
          for (const [field, accumulator] of Object.entries(spec)) {
            if (field !== '_id' && accumulator && accumulator.$avg !== undefined) entry[field] = { sum: 0, count: 0 };
            else if (field !== '_id' && accumulator && accumulator.$push !== undefined) entry[field] = [];
            else if (field !== '_id' && accumulator && accumulator.$addToSet !== undefined) entry[field] = [];
            else if (field !== '_id' && accumulator && accumulator.$first !== undefined) entry[field] = undefined;
            else if (field !== '_id') entry[field] = 0;
          }
          groups.set(key, entry);
        }
        const entry = groups.get(key);
        for (const [field, accumulator] of Object.entries(spec)) {
          if (field === '_id') continue;
          if (accumulator.$sum !== undefined) {
            const value = accumulator.$sum === 1 ? 1 : resolveExpression(accumulator.$sum, row);
            entry[field] += Number(value) || 0;
          } else if (accumulator.$avg !== undefined) {
            const value = resolveExpression(accumulator.$avg, row);
            if (value !== null && value !== undefined && Number.isFinite(Number(value))) {
              entry[field].sum += Number(value);
              entry[field].count += 1;
            }
          } else if (accumulator.$push !== undefined) {
            entry[field].push(resolveExpression(accumulator.$push, row));
          } else if (accumulator.$addToSet !== undefined) {
            const value = resolveExpression(accumulator.$addToSet, row);
            if (!entry[field].some((existing) => equal(existing, value))) entry[field].push(value);
          } else if (accumulator.$first !== undefined && entry[field] === undefined) {
            entry[field] = resolveExpression(accumulator.$first, row);
          } else if (accumulator.$max !== undefined) {
            const value = resolveExpression(accumulator.$max, row);
            if (entry[field] === 0 || compare(entry[field], value) < 0) entry[field] = value;
          } else if (accumulator.$min !== undefined) {
            const value = resolveExpression(accumulator.$min, row);
            if (entry[field] === 0 || compare(entry[field], value) > 0) entry[field] = value;
          }
        }
      }
      rows = [...groups.values()].map((entry) => {
        for (const value of Object.values(entry)) {
          if (value && typeof value === 'object' && !Array.isArray(value) && 'sum' in value && 'count' in value) {
            const field = Object.keys(entry).find((key) => entry[key] === value);
            entry[field] = value.count ? value.sum / value.count : null;
          }
        }
        return entry;
      });
    } else if (operator === '$facet') {
      const result = {};
      for (const [field, subPipeline] of Object.entries(spec)) {
        result[field] = await aggregate(rows, subPipeline, model);
      }
      rows = [result];
    } else if (operator === '$count') {
      rows = rows.length ? [{ [spec]: rows.length }] : [];
    }
  }
  return rows;
};

const createModel = (name, options = {}) => {
  const collection = options.collection || `${name.toLowerCase()}s`;
  const defaults = options.defaults || {};
  const dateFields = (options.dateFields || []).map((field) => field.split('.').pop());
  const uniqueFields = options.uniqueFields || [];

  const prepare = (input = {}) => {
    const now = new Date();
    const values = Object.fromEntries(
      Object.entries(clone(input)).filter(([, value]) => value !== undefined)
    );
    const result = { ...clone(defaults), ...values };
    if (options.createdAtDefault && !result.createdAt) result.createdAt = now;
    if (options.timestamps) {
      if (!result.createdAt) result.createdAt = now;
      result.updatedAt = now;
    }
    if (result._id === undefined) result._id = objectId();
    if (name === 'Order') {
      if (result.deliveryTime !== undefined) result.deliveryTime = String(result.deliveryTime);
      result.items = (result.items || []).map((item) => ({ _id: item._id || objectId(), ...item }));
      result.statusHistory = (result.statusHistory || []).map((item) => ({ _id: item._id || objectId(), ...item }));
    }
    if (name === 'Ingredient') {
      result.purchases = (result.purchases || []).map((item) => ({ _id: item._id || objectId(), ...item }));
    }
    return result;
  };

  const reviveDocument = (record) => {
    const doc = new Document(Model, revive(record, '', dateFields));
    if (Array.isArray(doc.purchases)) {
      Object.defineProperty(doc.purchases, 'id', {
        enumerable: false,
        value: (id) => doc.purchases.find((item) => String(item._id) === String(id)) || null
      });
    }
    return doc;
  };

  const rowsFrom = async (connection, lock = false) => {
    const [rows] = await connection.query(
      `SELECT document_json FROM app_documents WHERE collection_name = ?${lock ? ' FOR UPDATE' : ''}`,
      [collection]
    );
    return rows.map((row) => parseRow(row.document_json));
  };

  const saveRecord = async (record, sessionConnection) => {
    const doc = prepare(record);
    if (options.validate) {
      try {
        options.validate(doc);
      } catch (error) {
        if (error.name === 'Error') error.name = 'ValidationError';
        throw error;
      }
    }
    const connection = sessionConnection || await database.getConnection();
    const closeConnection = !sessionConnection;
    try {
      if (!sessionConnection) await connection.beginTransaction();
      for (const field of uniqueFields) {
        const value = getPath(doc, field);
        if (value === undefined || value === null || value === '') continue;
        const existing = (await rowsFrom(connection, true)).find((candidate) =>
          String(candidate._id) !== String(doc._id) && equal(getPath(candidate, field), value));
        if (existing) {
          const error = new Error(`Duplicate value for ${field}`);
          error.code = 11000;
          error.keyPattern = { [field]: 1 };
          throw error;
        }
      }
      await connection.query(
        `INSERT INTO app_documents (collection_name, document_id, document_json)
         VALUES (?, ?, CAST(? AS JSON))
         ON DUPLICATE KEY UPDATE document_json = VALUES(document_json)`,
        [collection, String(doc._id), JSON.stringify(doc)]
      );
      if (!sessionConnection) await connection.commit();
      return reviveDocument(doc);
    } catch (error) {
      if (!sessionConnection) await connection.rollback();
      throw error;
    } finally {
      if (closeConnection) connection.release();
    }
  };

  class Document {
    constructor(model, values) {
      Object.assign(this, values);
      Object.defineProperty(this, '_model', { value: model, enumerable: false });
    }

    async save(optionsArg = {}) {
      const sessionConnection = optionsArg && optionsArg.session && optionsArg.session.connection;
      const saved = await saveRecord(this, sessionConnection);
      for (const key of Object.keys(this)) delete this[key];
      Object.assign(this, saved);
      return this;
    }

    async deleteOne() {
      const connection = await database.getConnection();
      try {
        await connection.query(
          'DELETE FROM app_documents WHERE collection_name = ? AND document_id = ?',
          [collection, String(this._id)]
        );
        return { deletedCount: 1 };
      } finally {
        connection.release();
      }
    }

    async populate(path, projection) {
      const [field, subfield] = path.split('.');
      const populateModel = options.populate && options.populate[field];
      if (!populateModel) return this;
      const foreignModel = modelRegistry.get(populateModel);
      if (!foreignModel) return this;
      if (subfield && Array.isArray(this[field])) {
        for (const item of this[field]) {
          if (item[subfield]) item[subfield] = await foreignModel.findById(item[subfield], projection);
        }
      } else if (this[field]) {
        this[field] = await foreignModel.findById(this[field], projection);
      }
      return this;
    }

    addStatusHistory(status, userId, notes = '') {
      this.statusHistory = this.statusHistory || [];
      this.statusHistory.push({ status, changedBy: userId, changedAt: new Date(), notes });
    }

    calculateCookingTime() {
      if (this.cookingStartedAt && this.cookingCompletedAt) {
        this.cookingTime = Math.round((this.cookingCompletedAt - this.cookingStartedAt) / 60000);
      }
    }

    calculateDeliveryTime() {
      if (this.deliveryStartedAt && this.deliveryCompletedAt) {
        this.deliveryTime = Math.round((this.deliveryCompletedAt - this.deliveryStartedAt) / 60000).toString();
      }
    }

    toObject() {
      const result = clone(this);
      if (name === 'Order') result.totalItems = (result.items || []).reduce((total, item) => total + Number(item.quantity || 0), 0);
      if (name === 'Ingredient') result.totalPrice = Number(result.unitPrice || 0) * Number(result.quantity || 0);
      return result;
    }

    toJSON() {
      const result = this.toObject();
      if (name === 'Order' && result.dailyOrderNumber) result.orderNumber = result.dailyOrderNumber;
      return result;
    }
  }

  class Query {
    constructor(executor) {
      this.executor = executor;
      this.selection = null;
      this.sortSpec = null;
      this.skipCount = 0;
      this.limitCount = null;
      this.populates = [];
      this.isLean = false;
      this.connection = null;
      this.promise = null;
    }
    select(fields) { this.selection = fields; return this; }
    sort(spec) { this.sortSpec = spec; return this; }
    skip(count) { this.skipCount = Number(count) || 0; return this; }
    limit(count) { this.limitCount = Number(count); return this; }
    populate(path, fields) {
      if (typeof path === 'object') this.populates.push(path);
      else this.populates.push({ path, select: fields });
      return this;
    }
    lean() { this.isLean = true; return this; }
    session(session) { this.connection = session && session.connection; return this; }
    then(resolve, reject) { return this.exec().then(resolve, reject); }
    catch(reject) { return this.exec().catch(reject); }
    finally(callback) { return this.exec().finally(callback); }
    async exec() {
      if (!this.promise) this.promise = this.run();
      return this.promise;
    }
    async run() {
      let result = await this.executor(this.connection);
      const list = Array.isArray(result) ? result : result == null ? [] : [result];
      let output = list.map((doc) => doc instanceof Document ? doc : reviveDocument(doc));
      if (this.sortSpec) {
        const entries = Object.entries(this.sortSpec);
        output = output.slice().sort((a, b) => {
          for (const [field, direction] of entries) {
            const order = compare(getPath(a, field), getPath(b, field)) || 0;
            if (order) return order * direction;
          }
          return 0;
        });
      }
      if (this.skipCount) output = output.slice(this.skipCount);
      if (this.limitCount !== null) output = output.slice(0, this.limitCount);
      for (const populate of this.populates) {
        for (const doc of output) await doc.populate(populate.path, populate.select);
      }
      output = output.map((doc) => {
        const hidden = Model.hiddenFields || [];
        const selected = this.selection
          ? (Array.isArray(this.selection) ? this.selection : String(this.selection).split(/\s+/))
          : [];
        const defaultHidden = hidden
          .filter((field) => !selected.includes(`+${field}`))
          .map((field) => `-${field}`);
        const userSelection = Array.isArray(this.selection) ? this.selection.join(' ') : this.selection;
        const value = project(doc, [...defaultHidden, userSelection].filter(Boolean).join(' '));
        return this.isLean ? value : reviveDocument(value);
      });
      if (Array.isArray(result)) return output;
      return output[0] || null;
    }
  }

  class Model {
    static get collection() { return { name: collection }; }
    static get modelName() { return name; }
    static get hiddenFields() { return options.hiddenFields || []; }
    static async _all(connection) {
      const own = connection || await database.getConnection();
      try { return await rowsFrom(own); }
      finally { if (!connection) own.release(); }
    }
    static find(query = {}, projection) {
      const q = new Query(async (connection) => (await Model._all(connection)).filter((doc) => matches(doc, query)));
      if (projection) q.select(projection);
      return q;
    }
    static findOne(query = {}, projection) {
      const q = new Query(async (connection) => (await Model._all(connection)).find((doc) => matches(doc, query)) || null);
      if (projection) q.select(projection);
      return q;
    }
    static findById(id, projection) {
      const q = new Query(async (connection) =>
        (await Model._all(connection)).find((doc) => String(doc._id) === String(id)) || null);
      if (projection) q.select(projection);
      return q;
    }
    static async create(values) {
      if (Array.isArray(values)) return Promise.all(values.map((value) => saveRecord(value)));
      return saveRecord(values);
    }
    static async insertMany(values) { return Promise.all(values.map((value) => saveRecord(value))); }
    static async countDocuments(query = {}) {
      return (await Model._all()).filter((doc) => matches(doc, query)).length;
    }
    static async deleteMany(query = {}) {
      const connection = await database.getConnection();
      try {
        await connection.beginTransaction();
        const rows = await rowsFrom(connection, true);
        const ids = rows.filter((doc) => matches(doc, query)).map((doc) => String(doc._id));
        if (ids.length) {
          await connection.query(
            `DELETE FROM app_documents WHERE collection_name = ? AND document_id IN (${ids.map(() => '?').join(',')})`,
            [collection, ...ids]
          );
        }
        await connection.commit();
        return { deletedCount: ids.length };
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally { connection.release(); }
    }
    static findByIdAndDelete(id) {
      return new Query(async () => {
        const doc = await Model.findById(id);
        if (doc) await doc.deleteOne();
        return doc;
      });
    }
    static findByIdAndUpdate(id, update, optionsArg = {}) {
      return Model.findOneAndUpdate({ _id: id }, update, optionsArg);
    }
    static findOneAndUpdate(query, update, optionsArg = {}) {
      return new Query(async () => {
        const connection = optionsArg.session && optionsArg.session.connection
          ? optionsArg.session.connection : await database.getConnection();
        const ownConnection = !(optionsArg.session && optionsArg.session.connection);
        try {
          if (ownConnection) await connection.beginTransaction();
          const rows = await rowsFrom(connection, true);
          let record = rows.find((doc) => matches(doc, query));
          const before = record ? clone(record) : null;
          if (!record && optionsArg.upsert) {
            record = {};
            for (const [key, value] of Object.entries(query)) {
              if (!key.startsWith('$') && (!value || typeof value !== 'object' || value instanceof Date)) {
                setPath(record, key, value);
              }
            }
            record = prepare(record);
            applyUpdate(record, update);
          } else if (record) {
            record = clone(record);
            applyUpdate(record, update);
          }
          if (record) {
            const saved = await saveRecord(record, connection);
            record = optionsArg.new || optionsArg.returnDocument === 'after' ? saved : (before ? reviveDocument(before) : saved);
          }
          if (ownConnection) await connection.commit();
          return record;
        } catch (error) {
          if (ownConnection) await connection.rollback();
          throw error;
        } finally { if (ownConnection) connection.release(); }
      });
    }
    static async updateMany(query, update, optionsArg = {}) {
      const connection = optionsArg.session && optionsArg.session.connection
        ? optionsArg.session.connection : await database.getConnection();
      const ownConnection = !(optionsArg.session && optionsArg.session.connection);
      try {
        if (ownConnection) await connection.beginTransaction();
        const rows = await rowsFrom(connection, true);
        let modifiedCount = 0;
        for (const record of rows.filter((doc) => matches(doc, query))) {
          const original = JSON.stringify(record);
          applyUpdate(record, update);
          if (JSON.stringify(record) !== original) {
            await saveRecord(record, connection);
            modifiedCount += 1;
          }
        }
        if (ownConnection) await connection.commit();
        return { acknowledged: true, matchedCount: modifiedCount, modifiedCount };
      } catch (error) {
        if (ownConnection) await connection.rollback();
        throw error;
      } finally { if (ownConnection) connection.release(); }
    }
    static async bulkWrite(operations) {
      const connection = await database.getConnection();
      try {
        await connection.beginTransaction();
        let modifiedCount = 0;
        for (const operation of operations) {
          if (operation.updateOne) {
            const { filter, update } = operation.updateOne;
            const rows = await rowsFrom(connection, true);
            const record = rows.find((doc) => matches(doc, filter));
            if (record) {
              applyUpdate(record, update);
              await saveRecord(record, connection);
              modifiedCount += 1;
            }
          }
        }
        await connection.commit();
        return { acknowledged: true, modifiedCount, matchedCount: modifiedCount };
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally { connection.release(); }
    }
    static async aggregate(pipeline = []) {
      return aggregate(await Model._all(), pipeline, Model);
    }
    static async startSession() {
      const connection = await database.getConnection();
      let inTransaction = false;
      return {
        connection,
        withTransaction: async (callback) => {
          await connection.beginTransaction();
          inTransaction = true;
          try {
            const result = await callback();
            await connection.commit();
            inTransaction = false;
            return result;
          } catch (error) {
            await connection.rollback();
            inTransaction = false;
            throw error;
          }
        },
        endSession: async () => {
          if (inTransaction) await connection.rollback();
          connection.release();
        }
      };
    }
    static isValidObjectId(value) { return isValidObjectId(value); }
  }

  modelRegistry.set(name, Model);
  modelRegistry.set(collection, Model);
  return Model;
};

module.exports = { createModel, isValidObjectId, objectId };
