const Codes = {
  LIMIT_PART_COUNT: 'LIMIT_PART_COUNT',
  LIMIT_FILE_SIZE: 'LIMIT_FILE_SIZE',
  LIMIT_FILE_COUNT: 'LIMIT_FILE_COUNT',
  LIMIT_FIELD_KEY: 'LIMIT_FIELD_KEY',
  LIMIT_FIELD_VALUE: 'LIMIT_FIELD_VALUE',
  LIMIT_FIELD_COUNT: 'LIMIT_FIELD_COUNT',
  LIMIT_UNEXPECTED_FILE: 'LIMIT_UNEXPECTED_FILE',
  CLIENT_CLOSED_REQUEST: 'CLIENT_CLOSED_REQUEST'
}

exports.Codes = Codes

const statuses = new Map([
  [Codes.LIMIT_PART_COUNT, 413],
  [Codes.LIMIT_FILE_SIZE, 413],
  [Codes.LIMIT_FILE_COUNT, 413],
  [Codes.LIMIT_FIELD_KEY, 413],
  [Codes.LIMIT_FIELD_VALUE, 413],
  [Codes.LIMIT_FIELD_COUNT, 413],
  [Codes.LIMIT_UNEXPECTED_FILE, 400],
  [Codes.CLIENT_CLOSED_REQUEST, 499]
])

class MulterError extends Error {
  constructor (code, message, optionalField) {
    super(message)

    this.status = statuses.get(code)
    this.code = code
    this.name = this.constructor.name
    this.field = optionalField

    Error.captureStackTrace(this, this.constructor)
  }
}

exports.MulterError = MulterError
