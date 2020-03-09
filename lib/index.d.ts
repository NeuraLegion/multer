/* eslint-disable */

import * as express from 'express';
import { Readable } from 'stream';

declare interface Field {
  /** The field name. */
  name: string;
  /** Optional maximum number of files per field to accept. */
  maxCount?: number;
}

export enum Codes {
  LIMIT_PART_COUNT = 'LIMIT_PART_COUNT',
  LIMIT_FILE_SIZE = 'LIMIT_FILE_SIZE',
  LIMIT_FILE_COUNT = 'LIMIT_FILE_COUNT',
  LIMIT_FIELD_KEY = 'LIMIT_FIELD_KEY',
  LIMIT_FIELD_VALUE = 'LIMIT_FIELD_VALUE',
  LIMIT_FIELD_COUNT = 'LIMIT_FIELD_COUNT',
  LIMIT_UNEXPECTED_FILE = 'LIMIT_UNEXPECTED_FILE',
  CLIENT_CLOSED_REQUEST = 'CLIENT_CLOSED_REQUEST'
}

export class MulterError extends Error {
  readonly code: Codes;
  readonly status: number;
  readonly field?: string;

  constructor(code: Codes, message: string, field?: string);
}

declare interface File {
  /** Field name specified in the form  */
  readonly fieldName: string;
  /** Name of the file on the user's computer */
  readonly originalName: string;
  /** Encoding type of the file */
  readonly encoding: string;
  /** The detected mime-type, or null if we failed to detect */
  readonly detectedMimeType: string;
  /** The typical file extension for files of the detected type,
   * or empty string if we failed to detect (with leading `.` to match `path.extname`) */
  readonly detectedFileExtension: string;
  /** The mime type reported by the client using the `Content-Type` header, or null if the header was absent */
  readonly clientReportedMimeType: string | undefined;
  /** The extension of the file uploaded (as reported by `path.extname`) */
  readonly clientReportedFileExtension: string;
  /**  Size of the file in bytes */
  readonly size: number;
  /**  Location of the uploaded file */
  readonly path: string;
  /**  A Stream of the entire file */
  toStream(): Readable;
}

declare interface MulterOptions {
  /**
   * An object specifying the size limits of the following optional properties. This object is passed to busboy
   * directly, and the details of properties can be found on https://github.com/mscdex/busboy#busboy-methods
   */
  limits?: {
    /** Max field name size (Default: 100 bytes) */
    fieldNameSize?: number;
    /** Max field value size (Default: 1MB) */
    fieldSize?: number;
    /** Max number of non- file fields (Default: Infinity) */
    fields?: number;
    /** For multipart forms, the max file size (in bytes)(Default: Infinity) */
    fileSize?: number;
    /** For multipart forms, the max number of file fields (Default: Infinity) */
    files?: number;
    /** For multipart forms, the max number of parts (fields + files)(Default: Infinity) */
    parts?: number;
    /** For multipart forms, the max number of header key=> value pairs to parse Default: 2000(same as node's http). */
    headerPairs?: number;
  };
}

export class Multer {
  constructor (options?: MulterOptions);
  /** In case you need to handle a text-only multipart form, you can use any of the multer methods (.single(), .array(), fields()), req.body contains the text fields */
  /** Accept a single file with the name fieldName. The single file will be stored in req.file. */
  single(fieldName?: string): express.RequestHandler;
  /** Accept an array of files, all with the name fieldName. Optionally error out if more than maxCount files are uploaded. The array of files will be stored in req.files. */
  array(fieldName: string, maxCount?: number): express.RequestHandler;
  /** Accept a mix of files, specified by fields. An object with arrays of files will be stored in req.files. */
  fields(fields: Field[]): express.RequestHandler;
  /** Accepts all files that comes over the wire. An array of files will be stored in req.files. */
  any(): express.RequestHandler;
  /** Accept only text fields. If any file upload is made, error with code “LIMIT_UNEXPECTED_FILE” will be issued. This is the same as doing upload.fields([]). */
  none(): express.RequestHandler;
}

declare global {
  namespace Express {
    interface Request {
      file: File;
      files: {
        [fieldname: string]: File[];
      } | File[];
    }
  }
}
