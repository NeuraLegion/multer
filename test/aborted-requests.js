/* eslint-env mocha */

const util = require('./_util')
const { Multer, Codes } = require('../lib')
const FormData = require('form-data')
const PassThrough = require('stream').PassThrough
const pify = require('pify')
const assert = require('assert')

function getLength (form) {
  return pify(form.getLength).call(form)
}

function createAbortStream (maxBytes) {
  let bytesPassed = 0

  return new PassThrough({
    transform (chunk, _, cb) {
      if (bytesPassed + chunk.length < maxBytes) {
        bytesPassed += chunk.length
        this.push(chunk)
        return cb()
      }

      const bytesLeft = maxBytes - bytesPassed

      if (bytesLeft) {
        bytesPassed += bytesLeft
        this.push(chunk.slice(0, bytesLeft))
      }

      process.nextTick(() => this.emit('aborted'))
    }
  })
}

describe('Aborted requests', () => {
  it('should handle clients aborting the request', async () => {
    const form = new FormData()
    const parser = new Multer().single('file')

    form.append('file', util.file('small'))

    const length = await getLength(form)
    const req = createAbortStream(length - 100)

    req.headers = {
      'content-type': `multipart/form-data; boundary=${form.getBoundary()}`,
      'content-length': length
    }

    const result = pify(parser)(form.pipe(req), null)

    return assert.rejects(result, err => err.code === Codes.CLIENT_CLOSED_REQUEST)
  })
})
