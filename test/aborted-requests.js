const util = require('./_util')
const { Multer, Codes } = require('../lib')
const FormData = require('form-data')
const PassThrough = require('stream').PassThrough
const pify = require('pify')
const assert = require('assert')
const http = require('http')
const net = require('net')

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

  it('should not hang when client disconnects mid-upload (close event)', function (done) {
    this.timeout(5000)

    const upload = new Multer().any()

    const server = http.createServer((req, res) => {
      let hung = false

      const timer = setTimeout(() => {
        hung = true
        server.close()
        done(new Error('Middleware hung when client disconnected'))
      }, 1000)

      pify(upload)(req, res).then(
        () => {
          if (hung) return
          clearTimeout(timer)
          server.close()
          done()
        },
        () => {
          if (hung) return
          clearTimeout(timer)
          server.close()
          done()
        }
      )
    })

    server.listen(0, () => {
      const port = server.address().port
      const boundary = 'PoC' + Date.now()
      const sock = new net.Socket()

      sock.connect(port, '127.0.0.1', () => {
        sock.write(
          'POST / HTTP/1.1\r\n' +
          'Host: localhost\r\n' +
          `Content-Type: multipart/form-data; boundary=${boundary}\r\n` +
          'Content-Length: 999999\r\n\r\n' +
          `--${boundary}\r\n` +
          'Content-Disposition: form-data; name="file"; filename="test.bin"\r\n' +
          'Content-Type: application/octet-stream\r\n\r\n' +
          'AAAAAAAAAAAAAAAA'
        )

        setTimeout(() => sock.destroy(), 50)
      })

      sock.on('error', () => {})
    })
  })
})
