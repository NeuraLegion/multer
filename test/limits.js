const assert = require('assert')
const FormData = require('form-data')
const util = require('./_util')
const { Multer } = require('../lib')

describe('limits', () => {
  it('should report limit errors', async () => {
    const form = new FormData()
    const parser = new Multer({ limits: { fileSize: 100 } }).single('file')

    form.append('file', util.file('large'))

    await assert.rejects(
      util.submitForm(parser, form),
      (err) => err.code === 'LIMIT_FILE_SIZE' && err.field === 'file'
    )
  })
})
