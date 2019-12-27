/* eslint-env mocha */

const assert = require('assert')
const FormData = require('form-data')
const { Multer } = require('../lib')
const util = require('./_util')

describe('upload.none', () => {
  let parser

  before(() => {
    parser = new Multer().none()
  })

  it('should handle text fields', async () => {
    const form = new FormData()
    const parser = new Multer().none()

    form.append('foo', 'bar')
    form.append('test', 'yes')

    const req = await util.submitForm(parser, form)
    assert.strictEqual(req.file, undefined)
    assert.strictEqual(req.files, undefined)

    assert.strictEqual(req.body.foo, 'bar')
    assert.strictEqual(req.body.test, 'yes')
  })

  it('should reject single file', async () => {
    const form = new FormData()

    form.append('name', 'Multer')
    form.append('file', util.file('small'))

    await assert.rejects(
      util.submitForm(parser, form),
      (err) => err.code === 'LIMIT_UNEXPECTED_FILE' && err.field === 'file'
    )
  })

  it('should reject multiple files', async () => {
    const form = new FormData()

    form.append('name', 'Multer')
    form.append('file', util.file('tiny'))
    form.append('file', util.file('tiny'))

    await assert.rejects(
      util.submitForm(parser, form),
      (err) => err.code === 'LIMIT_UNEXPECTED_FILE' && err.field === 'file'
    )
  })
})
