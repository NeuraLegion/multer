const is = require('type-is')
const { createReadStream, unlink } = require('fs')
const appendField = require('append-field')
const { createFileAppender } = require('./file-appender')
const readBody = require('./read-body')

const handleRequest = async (setup, req) => {
  const options = setup()
  const result = await readBody(req, options.limits, options.fileFilter)

  req.body = Object.create(null)

  for (const field of result.fields) {
    appendField(req.body, field.key, field.value)
  }

  const fileAppender = createFileAppender(options.fileStrategy, req, options.fields)

  for (const file of result.files) {
    file.stream = createReadStream(file.path)
    file.stream.once('open', () => unlink(file.path, () => {}))

    fileAppender.append(file)
  }
}

const createMiddleware = setup => (req, res, next) => {
  if (!is(req, ['multipart'])) return next()
  handleRequest(setup, req).then(next, next)
}

module.exports = createMiddleware
