const { MulterError, Codes } = require('./error')

class BaseFileFilter {
  // eslint-disable-next-line no-unused-vars
  filter (file) {}
}
exports.BaseFileFilter = BaseFileFilter

class FileFilter extends BaseFileFilter {
  constructor (fields = []) {
    super()
    this.filesLeft = new Map(
      fields.map((field) => [field.name, typeof field.maxCount === 'number'
        ? field.maxCount
        : Infinity
      ])
    )
  }

  filter (file) {
    if (!this.filesLeft.has(file.fieldName)) {
      throw new MulterError(
        Codes.LIMIT_UNEXPECTED_FILE,
        `The method expect ${file.fieldName} field name.`,
        file.fieldName
      )
    }

    const left = this.filesLeft.get(file.fieldName)

    if (left <= 0) {
      throw new MulterError(
        Codes.LIMIT_FILE_COUNT,
        'The max file uploads exceeded.',
        file.fieldName
      )
    }

    this.filesLeft.set(file.fieldName, left - 1)
  }
}
exports.FileFilter = FileFilter

const createFileFilter = fields => new FileFilter(fields)

exports.createFileFilter = createFileFilter
