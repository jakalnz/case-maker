import { FREQUENCIES, DB_MIN, DB_STEP } from './utils.js';

/**
 * Compact binary encoding for share links, used instead of raw JSON so the
 * URL fits comfortably under typical link-length limits. All patient/point
 * levels sit on a 5dB grid between DB_MIN and DB_MAX (27 possible values),
 * which is what makes 5-bit packing lossless. This format is independent of
 * the JSON case-file schema (session-serializer.js) used for "Export JSON" /
 * class-library files, which stays full-fidelity and unpacked.
 */
export const COMPACT_FORMAT_VERSION = 1;

const EARS = ['right', 'left'];
const MODES = ['AC', 'BC'];
const MASKED = [false, true];
const TRANSDUCERS = ['headphone', 'insertphone'];
const LEVEL_BITS = 5; // 0..26 -> DB_MIN..DB_MAX in DB_STEP increments (27 values)

// cochlear/ipsiConductive/crossIAA are always written through
// patientModel.setParam(), which clampLevel()s onto the DB_STEP=5 grid — the
// LEVEL_BITS/5dB-step encoding above is lossless for them. ascDescDiff and
// psychWidth default to 2dB/4dB (js/patient-model.js defaultEarParams),
// which are *not* on that grid, so they need their own 1dB-resolution,
// wider-range encoding to stay lossless whether left at their default or
// edited (edits also go through the same clampLevel, i.e. land on the 5dB
// grid, which this wider encoding still represents exactly).
const FINE_LEVEL_BITS = 8; // 0..255 -> DB_MIN..(DB_MIN+255) in 1dB increments
const GRID_ROWS = ['cochlear', 'ipsiConductive'];
const FINE_ROWS = ['ascDescDiff', 'psychWidth'];

const INSERTPHONE_DEFAULT = FREQUENCIES.map((f) => (f <= 1000 ? 60 : 50));

// crossIAA row shape codes (2 bits)
const SHAPE_EXPLICIT = 0;
const SHAPE_FLAT = 1;
const SHAPE_INSERTPHONE_DEFAULT = 2;

function levelToCode(level) {
  return Math.round((level - DB_MIN) / DB_STEP);
}

function codeToLevel(code) {
  return DB_MIN + code * DB_STEP;
}

function fineToCode(level) {
  return Math.round(level - DB_MIN);
}

function codeToFine(code) {
  return DB_MIN + code;
}

class BitWriter {
  constructor() {
    this.bits = [];
  }

  write(value, width) {
    for (let i = width - 1; i >= 0; i--) {
      this.bits.push((value >>> i) & 1);
    }
  }

  align() {
    while (this.bits.length % 8 !== 0) this.bits.push(0);
  }

  toBytes() {
    const byteLength = Math.ceil(this.bits.length / 8);
    const bytes = new Uint8Array(byteLength);
    for (let i = 0; i < this.bits.length; i++) {
      if (this.bits[i]) bytes[i >> 3] |= 128 >> (i & 7);
    }
    return bytes;
  }
}

class BitReader {
  constructor(bytes) {
    this.bytes = bytes;
    this.pos = 0;
  }

  read(width) {
    let value = 0;
    for (let i = 0; i < width; i++) {
      const bit = (this.bytes[this.pos >> 3] >> (7 - (this.pos & 7))) & 1;
      value = (value << 1) | bit;
      this.pos++;
    }
    return value >>> 0;
  }

  align() {
    if (this.pos % 8 !== 0) this.pos += 8 - (this.pos % 8);
  }
}

function writeRow(writer, row, bits, toCode) {
  const values = FREQUENCIES.map((f) => row[f]);
  const flat = values.every((v) => v === values[0]);
  writer.write(flat ? 1 : 0, 1);
  if (flat) {
    writer.write(toCode(values[0]), bits);
  } else {
    values.forEach((v) => writer.write(toCode(v), bits));
  }
}

function readRow(reader, bits, fromCode) {
  const flat = reader.read(1);
  const row = {};
  if (flat) {
    const level = fromCode(reader.read(bits));
    FREQUENCIES.forEach((f) => { row[f] = level; });
  } else {
    FREQUENCIES.forEach((f) => { row[f] = fromCode(reader.read(bits)); });
  }
  return row;
}

function writeCrossRow(writer, transducer, row) {
  const values = FREQUENCIES.map((f) => row[f]);
  const flat = values.every((v) => v === values[0]);
  if (transducer === 'insertphone' && values.every((v, i) => v === INSERTPHONE_DEFAULT[i])) {
    writer.write(SHAPE_INSERTPHONE_DEFAULT, 2);
  } else if (flat) {
    writer.write(SHAPE_FLAT, 2);
    writer.write(levelToCode(values[0]), LEVEL_BITS);
  } else {
    writer.write(SHAPE_EXPLICIT, 2);
    values.forEach((v) => writer.write(levelToCode(v), LEVEL_BITS));
  }
}

function readCrossRow(reader) {
  const shape = reader.read(2);
  const row = {};
  if (shape === SHAPE_INSERTPHONE_DEFAULT) {
    FREQUENCIES.forEach((f, i) => { row[f] = INSERTPHONE_DEFAULT[i]; });
  } else if (shape === SHAPE_FLAT) {
    const level = codeToLevel(reader.read(LEVEL_BITS));
    FREQUENCIES.forEach((f) => { row[f] = level; });
  } else {
    FREQUENCIES.forEach((f) => { row[f] = codeToLevel(reader.read(LEVEL_BITS)); });
  }
  return row;
}

function pointKeyIndex(ear, mode, freq, masked) {
  const earIdx = EARS.indexOf(ear);
  const modeIdx = MODES.indexOf(mode);
  const freqIdx = FREQUENCIES.indexOf(freq);
  const maskedIdx = MASKED.indexOf(masked);
  return ((earIdx * MODES.length + modeIdx) * FREQUENCIES.length + freqIdx) * MASKED.length + maskedIdx;
}

const SLOT_COUNT = EARS.length * MODES.length * FREQUENCIES.length * MASKED.length; // 80

function writePatient(writer, patient) {
  EARS.forEach((ear) => {
    GRID_ROWS.forEach((rowName) => writeRow(writer, patient[ear][rowName], LEVEL_BITS, levelToCode));
    FINE_ROWS.forEach((rowName) => writeRow(writer, patient[ear][rowName], FINE_LEVEL_BITS, fineToCode));
  });
  TRANSDUCERS.forEach((t) => writeCrossRow(writer, t, patient.crossIAA[t]));
}

function readPatient(reader) {
  const patient = { crossIAA: {} };
  EARS.forEach((ear) => {
    patient[ear] = {};
    GRID_ROWS.forEach((rowName) => { patient[ear][rowName] = readRow(reader, LEVEL_BITS, codeToLevel); });
    FINE_ROWS.forEach((rowName) => { patient[ear][rowName] = readRow(reader, FINE_LEVEL_BITS, codeToFine); });
  });
  TRANSDUCERS.forEach((t) => { patient.crossIAA[t] = readCrossRow(reader); });
  return patient;
}

function writeStoredPoints(writer, points) {
  const bySlot = new Map();
  points.forEach((p) => bySlot.set(pointKeyIndex(p.ear, p.mode, p.freq, p.masked), p));
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    writer.write(bySlot.has(slot) ? 1 : 0, 1);
  }
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    const p = bySlot.get(slot);
    if (!p) continue;
    writer.write(levelToCode(p.level), LEVEL_BITS);
    writer.write(p.noResponse ? 1 : 0, 1);
  }
}

function readStoredPoints(reader) {
  const present = [];
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    present.push(reader.read(1) === 1);
  }
  const points = [];
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    if (!present[slot]) continue;
    const level = codeToLevel(reader.read(LEVEL_BITS));
    const noResponse = reader.read(1) === 1;
    const maskedIdx = slot % MASKED.length;
    const freqIdx = Math.floor(slot / MASKED.length) % FREQUENCIES.length;
    const modeIdx = Math.floor(slot / (MASKED.length * FREQUENCIES.length)) % MODES.length;
    const earIdx = Math.floor(slot / (MASKED.length * FREQUENCIES.length * MODES.length));
    points.push({
      ear: EARS[earIdx],
      mode: MODES[modeIdx],
      freq: FREQUENCIES[freqIdx],
      masked: MASKED[maskedIdx],
      level,
      noResponse,
    });
  }
  return points;
}

function concatBytes(chunks) {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((c) => { out.set(c, offset); offset += c.length; });
  return out;
}

export function encodeCompact(data, { xorPatientBytes } = {}) {
  const header = new BitWriter();
  header.write(COMPACT_FORMAT_VERSION, 4);
  header.write(data.transducer === 'insertphone' ? 1 : 0, 1);
  header.write(data.toggleDirection === 'up-quieter' ? 1 : 0, 1);
  header.write(data.locked ? 1 : 0, 1);
  header.write(Math.min(65535, Math.max(0, Math.round(data.durationSeconds ?? 0))), 16);
  header.align();
  const headerBytes = header.toBytes();

  const patientWriter = new BitWriter();
  writePatient(patientWriter, data.patient);
  patientWriter.align();
  const patientBytes = patientWriter.toBytes();
  if (data.locked && xorPatientBytes) xorPatientBytes(patientBytes);

  const pointsWriter = new BitWriter();
  writeStoredPoints(pointsWriter, data.storedPoints ?? []);
  pointsWriter.align();
  const pointsBytes = pointsWriter.toBytes();

  const lengthByte = new Uint8Array([patientBytes.length]);
  return concatBytes([headerBytes, lengthByte, patientBytes, pointsBytes]);
}

export function decodeCompact(bytes, { xorPatientBytes } = {}) {
  const header = new BitReader(bytes);
  const version = header.read(4);
  if (version !== COMPACT_FORMAT_VERSION) {
    throw new Error(`Unsupported compact share format version: ${version}`);
  }
  const transducer = header.read(1) === 1 ? 'insertphone' : 'headphone';
  const toggleDirection = header.read(1) === 1 ? 'up-quieter' : 'up-louder';
  const locked = header.read(1) === 1;
  const durationSeconds = header.read(16);
  header.align();
  const headerByteLength = header.pos / 8;

  const patientLength = bytes[headerByteLength];
  const patientStart = headerByteLength + 1;
  const patientBytes = bytes.slice(patientStart, patientStart + patientLength);
  if (locked && xorPatientBytes) xorPatientBytes(patientBytes);
  const patient = readPatient(new BitReader(patientBytes));

  const pointsBytes = bytes.subarray(patientStart + patientLength);
  const storedPoints = readStoredPoints(new BitReader(pointsBytes));

  return {
    schemaVersion: 2,
    patientInfo: { name: '', id: '', dob: '' },
    transducer,
    toggleDirection,
    patient,
    storedPoints,
    durationSeconds,
    locked,
  };
}
