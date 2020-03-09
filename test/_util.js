const fs = require('fs')
const path = require('path')
const pify = require('pify')
const hasha = require('hasha')
const assert = require('assert')
const stream = require('stream')

const onFinished = pify(require('on-finished'))

const files = new Map([
  ['empty', {
    clientReportedMimeType: 'application/octet-stream',
    detectedFileExtension: '',
    detectedMimeType: null,
    extension: '.dat',
    hash: 'd41d8cd98f00b204e9800998ecf8427e',
    size: 0
  }],
  ['large', {
    clientReportedMimeType: 'application/octet-stream',
    detectedFileExtension: '',
    detectedMimeType: null,
    extension: '',
    hash: 'd5554977e0b856fa5ad94fff283616fb',
    size: 2413677
  }],
  ['medium', {
    clientReportedMimeType: 'application/octet-stream',
    detectedFileExtension: '.gif',
    detectedMimeType: 'image/gif',
    extension: '.fake',
    hash: 'a88025890e6a2cd15edb83e0aecdddd1',
    size: 21057
  }],
  ['small', {
    clientReportedMimeType: 'application/octet-stream',
    detectedFileExtension: '',
    detectedMimeType: null,
    extension: '.dat',
    hash: '3817334ffb4cf3fcaa16c4258d888131',
    size: 1778
  }],
  ['tiny', {
    clientReportedMimeType: 'audio/midi',
    detectedFileExtension: '.mid',
    detectedMimeType: 'audio/midi',
    extension: '.mid',
    hash: 'c187e1be438cb952bb8a0e8142f4a6d1',
    size: 248
  }]
])

exports.file = function file (name) {
  return fs.createReadStream(path.join(__dirname, 'files', name + files.get(name).extension))
}

exports.knownFileLength = function knownFileLength (name) {
  return files.get(name).size
}

exports.assertFile = async (file, fieldName, fileName) => {
  if (!files.has(fileName)) {
    throw new Error(`No file named "${fileName}"`)
  }

  const expected = files.get(fileName)

  assert.strictEqual(file.fieldName, fieldName)
  assert.strictEqual(file.originalName, fileName + expected.extension)
  assert.strictEqual(file.size, expected.size)

  assert.strictEqual(file.clientReportedMimeType, expected.clientReportedMimeType)
  assert.strictEqual(file.clientReportedFileExtension, expected.extension)

  assert.strictEqual(file.detectedMimeType, expected.detectedMimeType)
  assert.strictEqual(file.detectedFileExtension, expected.detectedFileExtension)

  const hash = await hasha.fromStream(file.toStream(), { algorithm: 'md5' })

  assert.strictEqual(hash, expected.hash)
}

exports.assertFiles = (files) => {
  return Promise.all(files.map((args) => exports.assertFile(args[0], args[1], args[2])))
}

function getLength (form) {
  return pify(form.getLength).call(form)
}

exports.submitForm = async (multer, form) => {
  const length = await getLength(form)
  const req = new stream.PassThrough()

  req.complete = false
  form.once('end', () => { req.complete = true })

  form.pipe(req)
  req.headers = {
    'content-type': `multipart/form-data; boundary=${form.getBoundary()}`,
    'content-length': length
  }

  await pify(multer)(req, null)
  await onFinished(req)

  return req
}
