const { createFileFilter, BaseFileFilter } = require('./file-filter')
const { Strategies } = require('./file-appender')
const createMiddleware = require('./middleware')
const { Codes, MulterError } = require('./error')

class Multer {
  constructor (options = {}) {
    if (options === null) throw new TypeError('Expected object for argument "options", got null')
    if (typeof options !== 'object') throw new TypeError(`Expected object for argument "options", got ${typeof options}`)

    if (options.dest || options.storage || options.fileFilter) {
      throw new Error('The "dest", "storage" and "fileFilter" options where removed in Multer 2.0. Please refer to the latest documentation for new usage.')
    }
    this.limits = options.limits
  }

  _middleware (limits, fields, fileStrategy) {
    return createMiddleware(() => ({
      fields,
      limits,
      fileFilter: createFileFilter(fields),
      fileStrategy
    }))
  }

  single (name) {
    return this._middleware(this.limits, [{ name, maxCount: 1 }], Strategies.VALUE)
  }

  array (name, maxCount) {
    return this._middleware(this.limits, [{ name, maxCount }], Strategies.ARRAY)
  }

  fields (fields) {
    return this._middleware(this.limits, fields, Strategies.OBJECT)
  }

  none () {
    return this._middleware(this.limits, [], Strategies.NONE)
  }

  any () {
    return createMiddleware(() => ({
      fields: [],
      limits: this.limits,
      fileFilter: new BaseFileFilter(),
      fileStrategy: Strategies.ARRAY
    }))
  }
}

exports.Multer = Multer
exports.Codes = Codes
exports.MulterError = MulterError
