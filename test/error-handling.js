const FormData = require('form-data')
const pify = require('pify')
const assert = require('assert')
const stream = require('stream')
const fs = require('fs')
const os = require('os')
const path = require('path')
const util = require('./_util')
const { Multer, Codes } = require('../lib')

function withLimits (limits, fields) {
  return new Multer({ limits }).fields(fields)
}

function hasCode (code) {
  return (err) => err.code === code
}

function hasCodeAndField (code, field) {
  return (err) => {
    return err.code === code && err.field === field
  }
}

function hasMessage (message) {
  return (err) => err.message === message
}

describe('Error Handling', () => {
  it('should respect parts limit', async () => {
    const form = new FormData()
    const parser = withLimits({ parts: 1 }, [
      { name: 'small', maxCount: 1 }
    ])

    form.append('field0', 'BOOM!')
    form.append('small', util.file('small'))

    await assert.rejects(
      util.submitForm(parser, form),
      hasCode(Codes.LIMIT_PART_COUNT)
    )
  })

  it('should respect file size limit', async () => {
    const form = new FormData()
    const parser = withLimits({ fileSize: 1500 }, [
      { name: 'tiny', maxCount: 1 },
      { name: 'small', maxCount: 1 }
    ])

    form.append('tiny', util.file('tiny'))
    form.append('small', util.file('small'))

    await assert.rejects(
      util.submitForm(parser, form),
      hasCodeAndField(Codes.LIMIT_FILE_SIZE, 'small')
    )
  })

  it('should respect file count limit', async () => {
    const form = new FormData()
    const parser = withLimits({ files: 1 }, [
      { name: 'small', maxCount: 1 },
      { name: 'small', maxCount: 1 }
    ])

    form.append('small', util.file('small'))
    form.append('small', util.file('small'))

    await assert.rejects(
      util.submitForm(parser, form),
      hasCode(Codes.LIMIT_FILE_COUNT)
    )
  })

  it('should not leave orphaned temp files when an error occurs during multi-file upload', async () => {
    // Upload two files with a files:1 limit — busboy emits filesLimit after
    // the first file, so the first file's temp write is in-flight or complete
    // when the error is raised.  The cleanup must unlink it.
    const tmpDir = os.tmpdir()
    const before = new Set(fs.readdirSync(tmpDir))

    const form = new FormData()
    form.append('file', util.file('large'))
    form.append('file2', util.file('tiny'))

    const parser = new Multer({ limits: { files: 1 } }).any()
    const length = await pify(form.getLength).call(form)
    const req = new stream.PassThrough()

    req.headers = {
      'content-type': `multipart/form-data; boundary=${form.getBoundary()}`,
      'content-length': length
    }

    await assert.rejects(
      pify(parser)(form.pipe(req), null),
      err => err.code === Codes.LIMIT_FILE_COUNT
    )

    // Wait a tick for async fs.unlink callbacks to settle
    await new Promise(resolve => setImmediate(resolve))

    const after = new Set(fs.readdirSync(tmpDir))
    const leaked = [...after].filter(f => !before.has(f))

    assert.strictEqual(
      leaked.length,
      0,
      `Orphaned temp files left behind: ${leaked.map(f => path.join(tmpDir, f)).join(', ')}`
    )
  })

  it('should not leave orphaned temp files when fileFilter rejects a file', async () => {
    // Trigger LIMIT_UNEXPECTED_FILE (fileFilter throws synchronously) while a
    // valid file is already in flight — the valid file's temp write must be
    // cleaned up because the caller never receives it.
    const tmpDir = os.tmpdir()
    const before = new Set(fs.readdirSync(tmpDir))

    const form = new FormData()
    form.append('allowed', util.file('large'))   // valid field
    form.append('blocked', util.file('tiny'))    // unexpected field → throws

    // Only 'allowed' is permitted
    const parser = new Multer().fields([{ name: 'allowed', maxCount: 1 }])

    const length = await pify(form.getLength).call(form)
    const req = new stream.PassThrough()

    req.headers = {
      'content-type': `multipart/form-data; boundary=${form.getBoundary()}`,
      'content-length': length
    }

    await assert.rejects(
      pify(parser)(form.pipe(req), null),
      err => err.code === Codes.LIMIT_UNEXPECTED_FILE
    )

    await new Promise(resolve => setImmediate(resolve))

    const after = new Set(fs.readdirSync(tmpDir))
    const leaked = [...after].filter(f => !before.has(f))

    assert.strictEqual(
      leaked.length,
      0,
      `Orphaned temp files left behind: ${leaked.map(f => path.join(tmpDir, f)).join(', ')}`
    )
  })

  it('should respect file key limit', async () => {
    const form = new FormData()
    const parser = withLimits({ fieldNameSize: 4 }, [
      { name: 'small', maxCount: 1 }
    ])

    form.append('small', util.file('small'))

    await assert.rejects(
      util.submitForm(parser, form),
      hasCode(Codes.LIMIT_FIELD_KEY)
    )
  })

  it('should respect field key limit', async () => {
    const form = new FormData()
    const parser = withLimits({ fieldNameSize: 4 }, [])

    form.append('ok', 'SMILE')
    form.append('blowup', 'BOOM!')

    await assert.rejects(
      util.submitForm(parser, form),
      hasCode(Codes.LIMIT_FIELD_KEY)
    )
  })

  it('should respect field value limit', async () => {
    const form = new FormData()
    const parser = withLimits({ fieldSize: 16 }, [])

    form.append('field0', 'This is okay')
    form.append('field1', 'This will make the parser explode')

    await assert.rejects(
      util.submitForm(parser, form),
      hasCodeAndField(Codes.LIMIT_FIELD_VALUE, 'field1')
    )
  })

  it('should respect field count limit', async () => {
    const form = new FormData()
    const parser = withLimits({ fields: 1 }, [])

    form.append('field0', 'BOOM!')
    form.append('field1', 'BOOM!')

    await assert.rejects(
      util.submitForm(parser, form),
      hasCode(Codes.LIMIT_FIELD_COUNT)
    )
  })

  it('should respect fields given', async () => {
    const form = new FormData()
    const parser = withLimits(undefined, [
      { name: 'wrongname', maxCount: 1 }
    ])

    form.append('small', util.file('small'))

    await assert.rejects(
      util.submitForm(parser, form),
      hasCodeAndField(Codes.LIMIT_UNEXPECTED_FILE, 'small')
    )
  })

  it('should report errors from busboy constructor', async () => {
    const req = new stream.PassThrough()
    const upload = new Multer().single('tiny')
    const body = 'test'

    req.headers = {
      'content-type': 'multipart/form-data',
      'content-length': body.length
    }

    req.end(body)

    await assert.rejects(
      pify(upload)(req, null),
      hasMessage('Multipart: Boundary not found')
    )
  })

  it('should report errors from busboy parsing', async () => {
    const req = new stream.PassThrough()
    const upload = new Multer().single('tiny')
    const boundary = 'AaB03x'
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="tiny"; filename="test.txt"',
      'Content-Type: text/plain',
      '',
      'test without end boundary'
    ].join('\r\n')

    req.headers = {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      'content-length': body.length
    }

    req.end(body)

    await assert.rejects(
      pify(upload)(req, null),
      hasMessage('Unexpected end of multipart data')
    )
  })

  it('should gracefully handle more than one error at a time', async () => {
    const form = new FormData()
    const parser = withLimits({ fileSize: 1, files: 1 }, [
      { name: 'small', maxCount: 1 }
    ])

    form.append('small', util.file('small'))
    form.append('small', util.file('small'))

    await assert.rejects(
      util.submitForm(parser, form),
      hasCode(Codes.LIMIT_FILE_SIZE)
    )
  });

  ['""', ''].forEach((name) =>
    it(`should notify of missing field name for file upload (name=${name})`, async () => {
      const req = new stream.PassThrough()
      const upload = new Multer().any()
      const boundary = 'AaB03x'
      const body = [
        `--${boundary}`,
        `Content-Disposition: form-data; name=${name}; filename="test.dat"`,
        'Content-Type: application/octet-stream',
        '',
        'hello',
        `--${boundary}--`
      ].join('\r\n')

      req.headers = {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'content-length': body.length
      }

      req.end(body)

      await assert.rejects(
        pify(upload)(req, null),
        hasCode(Codes.MISSING_FIELD_NAME)
      )
    }))
})
