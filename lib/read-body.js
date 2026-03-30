const { extname } = require('path')
const fs = require('fs')
const Busboy = require('@fastify/busboy')
const FileType = require('file-type')
const { MulterError, Codes } = require('./error')
const { createReadStream } = fs
const stream = require('stream')
const { promisify } = require('util')
const finished = promisify(require('on-finished'))
const pipeline = promisify(stream.pipeline)

const collectFields = (busboy, limits) => new Promise((resolve, reject) => {
  const result = []

  busboy.on('field', (fieldname, value, fieldnameTruncated, valueTruncated) => {
    if (fieldname == null || fieldname === '') {
      return reject(new MulterError(
        Codes.MISSING_FIELD_NAME,
        'Field name is required.'
      ))
    }

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

const collectFiles = (busboy, limits, fileFilter) => {
  const fileTasks = []
  const tempFiles = new Set()
  let errorOccured = false

  const rejectOnce = (reject, err) => {
    if (errorOccured) return
    errorOccured = true
    reject(err)
  }

  const promise = new Promise((resolve, reject) => {
    const _reject = rejectOnce.bind(null, reject)

    busboy.on('file', async (fieldname, fileStream, filename, encoding, mimetype) => {
      if (fieldname == null || fieldname === '') {
        fileStream.resume()
        return _reject(new MulterError(
          Codes.MISSING_FIELD_NAME,
          'Field name is required.'
        ))
      }

      if (
        typeof limits.fieldNameSize === 'number' &&
        fieldname.length > limits.fieldNameSize
      ) {
        fileStream.resume()
        return _reject(new MulterError(
          Codes.LIMIT_FIELD_KEY,
          `The multipart field name exceeds the ${limits.fieldNameSize} byte size limit.`
        ))
      }

      if (errorOccured) {
        return fileStream.resume()
      }

      // Catch all errors on file stream
      fileStream.once('error', _reject)

      // Catch limit exceeded on file stream
      fileStream.once('limit', () =>
        _reject(new MulterError(
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
        fileStream.resume()
        return _reject(err)
      }

      if (!createWriteStream) {
        ({ createWriteStream } = await import('fs-temp'))
      }

      // Re-check after the async import — an error may have occurred in the meantime
      if (errorOccured) {
        return fileStream.resume()
      }

      const target = createWriteStream()

      // Track the temp file path so the caller can clean it up on error
      tempFiles.add(target.path)

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
        .catch(_reject)
        .finally(() => fileStream.resume())

      fileTasks.push(fileTask)
    })

    busboy.once('finish', () => {
      resolve(
        Promise.all(fileTasks).then((files) => {
          // All files successfully written — caller owns them, clear tracking
          tempFiles.clear()
          return files
        })
      )
    })
  })

  return { promise, tempFiles }
}

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

    req.unpipe(busboy)
    busboy.destroy(error)
  }

  const fields = collectFields(busboy, limits)
  const { promise: files, tempFiles } = collectFiles(busboy, limits, fileFilter)
  const guard = new Promise((resolve, reject) => {
    req.once('error', reject)
    busboy.once('error', reject)

    req.once('aborted', () => reject(new MulterError(
      Codes.CLIENT_CLOSED_REQUEST,
      'Request disconnected during file upload stream parsing.'
    )))

    req.on('close', () => {
      if (req.readableEnded) return
      reject(new MulterError(
        Codes.CLIENT_CLOSED_REQUEST,
        'Request disconnected during file upload stream parsing.'
      ))
    })
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
    req.resume()

    // Clean up any temp files that were written but will never be returned to the caller
    for (const tmpPath of tempFiles) {
      fs.unlink(tmpPath, () => {})
    }

    // Drain request body before propagating the error — avoids EPIPE on the
    // client (server closing connection while the client is still sending).
    // Also listen for 'close' so we don't hang when the client aborts.
    // Skip waiting if the stream is already destroyed (e.g. client aborted).
    if (req.readable && !req.destroyed) {
      await finished(req).catch(() => {})
    }

    throw err
  }
}

module.exports = readBody
