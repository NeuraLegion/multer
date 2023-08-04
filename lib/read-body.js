const { extname } = require('path')
const Busboy = require('@fastify/busboy')
const FileType = require('file-type')
const { MulterError, Codes } = require('./error')
const { createReadStream } = require('fs')
const stream = require('stream')
const { promisify } = require('util')
const finished = promisify(require('on-finished'))
const pipeline = promisify(stream.pipeline)

const collectFields = (busboy, limits) => new Promise((resolve, reject) => {
  const result = []

  busboy.on('field', (fieldname, value, fieldnameTruncated, valueTruncated) => {
    if (
      fieldnameTruncated ||
      (typeof limits.fieldNameSize === 'number' &&
        fieldname.length > limits.fieldNameSize)
    ) {
      return reject(
        new MulterError(
          Codes.LIMIT_FIELD_KEY,
          `The multipart field name exceeds the ${limits.fieldNameSize} byte size limit.`
        ))
    }

    if (valueTruncated) {
      return reject(
        new MulterError(
          Codes.LIMIT_FIELD_VALUE,
          `The multipart field value exceeds the ${limits.fieldSize} byte size limit.`,
          fieldname
        ))
    }

    result.push({ key: fieldname, value })
  })

  busboy.once('finish', () => resolve(result))
})

let createWriteStream

const collectFiles = (busboy, limits, fileFilter) => new Promise((resolve, reject) => {
  const fileTasks = []

  busboy.on('file', async (fieldname, fileStream, filename, encoding, mimetype) => {
    if (
      typeof limits.fieldNameSize === 'number' &&
      fieldname.length > limits.fieldNameSize
    ) {
      return reject(new MulterError(
        Codes.LIMIT_FIELD_KEY,
        `The multipart field name exceeds the ${limits.fieldNameSize} byte size limit.`
      ))
    }

    // Catch all errors on file stream
    fileStream.once('error', reject)

    // Catch limit exceeded on file stream
    fileStream.once('limit', () =>
      reject(new MulterError(
        Codes.LIMIT_FILE_SIZE,
        `File truncated as it exceeds the ${limits.fileSize} byte size limit.`,
        fieldname
      )))

    const file = {
      fieldName: fieldname,
      originalName: filename,
      clientReportedMimeType: mimetype,
      clientReportedFileExtension: extname(filename || ''),
      toStream () {
        return this.path ? createReadStream(this.path) : stream.Readable.from([])
      }
    }

    try {
      fileFilter.filter(file)
    } catch (err) {
      return reject(err)
    }

    if (!createWriteStream) {
      ({ createWriteStream } = await import('fs-temp'))
    }

    const target = createWriteStream()

    const fileTask = FileType.stream(fileStream)
      .then((stream) => {
        file.detectedMimeType = (stream.fileType ? stream.fileType.mime : null)
        file.detectedFileExtension = (stream.fileType ? `.${stream.fileType.ext}` : '')

        return pipeline(stream, target)
      })
      .then(() => {
        file.path = target.path
        file.size = target.bytesWritten

        return file
      })
      .catch(reject)
      .finally(() => fileStream.resume())

    fileTasks.push(fileTask)
  })

  busboy.once('finish', () => resolve(Promise.all(fileTasks)))
})

const DEFAULT_LIMITS = {
  fieldNameSize: 100,
  fieldSize: 1000000,
  fields: Infinity,
  fileSize: Infinity,
  files: Infinity,
  parts: Infinity,
  headerPairs: 2000
}

const readBody = async (req, limits, fileFilter) => {
  limits = Object.assign({}, DEFAULT_LIMITS, limits)

  const busboy = new Busboy({
    limits,
    headers: req.headers
  })

  const requestError = error => {
    if (!busboy) {
      return
    }

    busboy.destroy(error)
  }

  const fields = collectFields(busboy, limits)
  const files = collectFiles(busboy, limits, fileFilter)
  const guard = new Promise((resolve, reject) => {
    req.once('error', reject)
    busboy.once('error', reject)

    req.once('aborted', () => reject(new MulterError(
      Codes.CLIENT_CLOSED_REQUEST,
      'Request disconnected during file upload stream parsing.'
    )))
    busboy.once('partsLimit', () => reject(new MulterError(
      Codes.LIMIT_PART_COUNT,
      `${limits.parts} max parts exceeded.`
    )))
    busboy.once('filesLimit', () => reject(new MulterError(
      Codes.LIMIT_FILE_COUNT,
      `${limits.files} max file uploads exceeded.`
    )))
    busboy.once('fieldsLimit', () => reject(new MulterError(
      Codes.LIMIT_FIELD_COUNT,
      `${limits.fields} max fields exceeded.`
    )))

    busboy.once('finish', resolve)
  })

  req.pipe(busboy)
  req.once('error', requestError)

  try {
    const result = await Promise.all([fields, files, guard])
    return { fields: result[0], files: result[1] }
  } catch (err) {
    req.unpipe(busboy)
    req.removeListener('error', requestError)
    busboy.removeAllListeners()
    setImmediate(() => req.resume())

    // Wait for request to close, finish, or error
    await finished(req).catch(() => {})

    throw err
  }
}

module.exports = readBody
