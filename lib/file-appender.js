const Strategies = {
  NONE: 'NONE',
  VALUE: 'VALUE',
  ARRAY: 'ARRAY',
  OBJECT: 'OBJECT'
}

exports.Strategies = Strategies

class FileAppender {
  get strategy () {
    return this._strategy
  }

  constructor (strategy = Strategies.NONE, req) {
    this._strategy = strategy
    this.req = req
  }

  append (file) {}
}
exports.FileAppender = FileAppender

class ValueFileAppender extends FileAppender {
  constructor (req) {
    super(Strategies.VALUE, req)
    this.req.file = null
  }

  append (file) {
    this.req.file = file
  }
}
exports.ValueFileAppender = ValueFileAppender

class ArrayFileAppender extends FileAppender {
  constructor (req) {
    super(Strategies.ARRAY, req)
    this.req.files = []
  }

  append (file) {
    this.req.files.push(file)
  }
}
exports.ArrayFileAppender = ArrayFileAppender

class ObjectFileAppender extends FileAppender {
  constructor (req, fields = []) {
    super(Strategies.OBJECT, req)
    this.req.files = Object.create(null)
    for (const field of fields) {
      req.files[field.name] = []
    }
  }

  append (file) {
    this.req.files[file.fieldName].push(file)
  }
}
exports.ObjectFileAppender = ObjectFileAppender

const createFileAppender = (strategy, req, fields) => {
  switch (strategy) {
    case 'NONE':
      return new FileAppender(Strategies.NONE, req)
    case 'VALUE':
      return new ValueFileAppender(req)
    case 'ARRAY':
      return new ArrayFileAppender(req)
    case 'OBJECT':
      return new ObjectFileAppender(req, fields)
    default: throw new Error(`Unknown file strategy: ${strategy}`)
  }
}

exports.createFileAppender = createFileAppender
