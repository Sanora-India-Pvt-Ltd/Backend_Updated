/**
 * Repository base — wraps a Mongoose model with common CRUD operations.
 * Foundation only; do not refactor existing controllers to use this until migration phase.
 *
 * @param {import('mongoose').Model} model - Mongoose model
 */

class BaseRepository {
    constructor(model) {
        if (!model) {
            throw new Error('BaseRepository requires a Mongoose model');
        }
        this.model = model;
    }

    /**
     * @param {string|import('mongoose').Types.ObjectId} id
     * @param {string|object} [projection]
     * @param {object} [options]
     * @returns {Promise<import('mongoose').Document|null>}
     */
    async findById(id, projection = null, options = {}) {
        return this.model.findById(id, projection, options).exec();
    }

    /**
     * @param {object} filter
     * @param {string|object} [projection]
     * @param {object} [options]
     * @returns {Promise<import('mongoose').Document|null>}
     */
    async findOne(filter, projection = null, options = {}) {
        return this.model.findOne(filter, projection, options).exec();
    }

    /**
     * @param {object} [filter]
     * @param {string|object} [projection]
     * @param {object} [options] - sort, skip, limit, lean
     * @returns {Promise<import('mongoose').Document[]>}
     */
    async findMany(filter = {}, projection = null, options = {}) {
        let query = this.model.find(filter, projection);

        if (options.sort) query = query.sort(options.sort);
        if (options.skip != null) query = query.skip(options.skip);
        if (options.limit != null) query = query.limit(options.limit);
        if (options.lean) query = query.lean();

        return query.exec();
    }

    /**
     * @param {object} data - Plain object to create document
     * @returns {Promise<import('mongoose').Document>}
     */
    async create(data) {
        return this.model.create(data);
    }

    /**
     * @param {string|import('mongoose').Types.ObjectId} id
     * @param {object} update
     * @param {object} [options] - e.g. { new: true }
     * @returns {Promise<import('mongoose').Document|null>}
     */
    async update(id, update, options = {}) {
        return this.model
            .findByIdAndUpdate(id, update, { new: true, ...options })
            .exec();
    }

    /**
     * @param {object} filter
     * @param {object} update
     * @param {object} [options]
     * @returns {Promise<import('mongoose').Document|null>}
     */
    async updateOne(filter, update, options = {}) {
        return this.model
            .findOneAndUpdate(filter, update, { new: true, ...options })
            .exec();
    }

    /**
     * @param {string|import('mongoose').Types.ObjectId} id
     * @returns {Promise<import('mongoose').Document|null>}
     */
    async delete(id) {
        return this.model.findByIdAndDelete(id).exec();
    }

    /**
     * @param {object} filter
     * @returns {Promise<object>} deleteResult
     */
    async deleteOne(filter) {
        return this.model.deleteOne(filter).exec();
    }
}

module.exports = BaseRepository;
