/**
 * Minimal reader for NumPy `.npy` matrices.
 *
 * The embedding lab writes one float16 matrix (`vectors.npy`) beside the chunk
 * manifest. Only the subset of the format that NumPy emits for a C-ordered
 * 2-D array is supported. Anything else is rejected instead of guessed: a
 * wrong dtype or byte order would silently corrupt every vector.
 *
 * The reader keeps the file in one Buffer and converts a row on demand, so a
 * 7,000 x 1,024 float16 artifact does not become 7,000 JavaScript arrays in
 * memory at once.
 */

export type NpyDtype = "float16" | "float32";

export interface NpyMatrix {
  readonly rows: number;
  readonly columns: number;
  readonly dtype: NpyDtype;
  /** Materialize one row as float32 values. */
  row(index: number): number[];
}

const MAGIC = Buffer.from([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59]); // "\x93NUMPY"
const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

export function parseNpy(input: Uint8Array): NpyMatrix {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (buffer.length < 10 || !buffer.subarray(0, 6).equals(MAGIC)) {
    throw new Error("Not a NumPy .npy file (bad magic)");
  }

  const major = buffer[6]!;
  const minor = buffer[7]!;
  let headerStart: number;
  let headerLength: number;
  if (major === 1) {
    headerStart = 10;
    headerLength = buffer.readUInt16LE(8);
  } else if (major === 2 || major === 3) {
    if (buffer.length < 12) throw new Error("Truncated .npy header");
    headerStart = 12;
    headerLength = buffer.readUInt32LE(8);
  } else {
    throw new Error(`Unsupported .npy version ${major}.${minor}`);
  }

  const dataOffset = headerStart + headerLength;
  if (dataOffset > buffer.length) throw new Error("Truncated .npy header");
  const header = buffer.toString("latin1", headerStart, dataOffset);
  const dtype = dtypeFor(readHeaderString(header, "descr"));
  if (readFortranOrder(header)) {
    throw new Error("Fortran-ordered .npy matrices are not supported");
  }
  const [rows, columns] = readShape(header);
  const bytesPerValue = dtype === "float16" ? 2 : 4;
  const expected = rows * columns * bytesPerValue;
  if (buffer.length < dataOffset + expected) {
    throw new Error(
      `Truncated .npy payload: expected ${expected} bytes for ${rows}x${columns}, found ${buffer.length - dataOffset}`,
    );
  }

  return {
    rows,
    columns,
    dtype,
    row(index: number): number[] {
      if (!Number.isInteger(index) || index < 0 || index >= rows) {
        throw new RangeError(`Row ${index} is outside 0..${rows - 1}`);
      }
      const start = dataOffset + index * columns * bytesPerValue;
      const vector = Array.from({ length: columns }, (): number => 0);
      if (dtype === "float16") {
        for (let column = 0; column < columns; column += 1) {
          vector[column] = halfToFloat(buffer.readUInt16LE(start + column * 2));
        }
      } else {
        for (let column = 0; column < columns; column += 1) {
          vector[column] = buffer.readFloatLE(start + column * 4);
        }
      }
      return vector;
    },
  };
}

/** Reject an artifact whose rows are not L2-normalized before it reaches pgvector. */
export function assertNormalized(matrix: NpyMatrix, tolerance = 0.02): void {
  for (let index = 0; index < matrix.rows; index += 1) {
    const vector = matrix.row(index);
    let sum = 0;
    for (const value of vector) {
      if (!Number.isFinite(value)) {
        throw new Error(`Row ${index} contains a non-finite value`);
      }
      sum += value * value;
    }
    const norm = Math.sqrt(sum);
    if (Math.abs(norm - 1) > tolerance) {
      throw new Error(`Row ${index} is not L2-normalized (norm ${norm.toFixed(6)})`);
    }
  }
}

function readHeaderString(header: string, key: string): string {
  const match = new RegExp(`['"]${key}['"]\\s*:\\s*['"]([^'"]+)['"]`).exec(header);
  const value = match?.[1];
  if (!value) throw new Error(`The .npy header has no ${key}`);
  return value;
}

function readFortranOrder(header: string): boolean {
  const match = /['"]fortran_order['"]\s*:\s*(True|False)/.exec(header);
  if (!match) throw new Error("The .npy header has no fortran_order");
  return match[1] === "True";
}

function readShape(header: string): [number, number] {
  const match = /['"]shape['"]\s*:\s*\(([^)]*)\)/.exec(header);
  if (!match) throw new Error("The .npy header has no shape");
  const shape = match[1]!
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map(Number);
  if (shape.length !== 2 || shape.some((value) => !Number.isInteger(value) || value < 0)) {
    throw new Error(`Only 2-D .npy matrices are supported (shape: (${match[1]!.trim()}))`);
  }
  return [shape[0]!, shape[1]!];
}

function dtypeFor(descr: string): NpyDtype {
  const normalized = descr.trim().toLowerCase();
  if (normalized.startsWith(">")) {
    throw new Error("Big-endian .npy matrices are not supported");
  }
  if (["<f2", "|f2", "=f2", "f2"].includes(normalized)) {
    if (normalized === "=f2" && !LITTLE_ENDIAN) {
      throw new Error("Big-endian .npy matrices are not supported");
    }
    return "float16";
  }
  if (["<f4", "|f4", "=f4", "f4"].includes(normalized)) {
    if (normalized === "=f4" && !LITTLE_ENDIAN) {
      throw new Error("Big-endian .npy matrices are not supported");
    }
    return "float32";
  }
  throw new Error(`Unsupported .npy dtype ${descr}; expected float16 or float32`);
}

/** IEEE 754 binary16 to binary32. */
function halfToFloat(bits: number): number {
  const sign = bits & 0x8000 ? -1 : 1;
  const exponent = (bits >> 10) & 0x1f;
  const fraction = bits & 0x03ff;
  if (exponent === 0) {
    return fraction === 0 ? 0 : sign * 2 ** -14 * (fraction / 1024);
  }
  if (exponent === 0x1f) {
    return fraction === 0 ? sign * Infinity : Number.NaN;
  }
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}
