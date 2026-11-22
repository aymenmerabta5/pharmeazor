import { describe, expect, it } from "bun:test";
import { assertNormalized, parseNpy } from "@repo/modules/retrieval";

function buildNpyWithHeader(header: string, data: Buffer): Buffer {
  const prefixLength = 10;
  const padding = (64 - ((prefixLength + header.length + 1) % 64)) % 64;
  const headerBuffer = Buffer.from(`${header}${" ".repeat(padding)}\n`, "latin1");
  const buffer = Buffer.alloc(prefixLength + headerBuffer.length + data.length);
  Buffer.from([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59, 1, 0]).copy(buffer, 0);
  buffer.writeUInt16LE(headerBuffer.length, 8);
  headerBuffer.copy(buffer, 10);
  data.copy(buffer, prefixLength + headerBuffer.length);
  return buffer;
}

function buildNpy(
  descr: string,
  rows: number,
  columns: number,
  data: Buffer,
  fortranOrder = false,
): Buffer {
  return buildNpyWithHeader(
    `{'descr': '${descr}', 'fortran_order': ${
      fortranOrder ? "True" : "False"
    }, 'shape': (${rows}, ${columns}), }`,
    data,
  );
}

function float16Buffer(bits: readonly number[]): Buffer {
  const buffer = Buffer.alloc(bits.length * 2);
  bits.forEach((value, index) => buffer.writeUInt16LE(value, index * 2));
  return buffer;
}

function float32Buffer(values: readonly number[]): Buffer {
  const buffer = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => buffer.writeFloatLE(value, index * 4));
  return buffer;
}

describe("NumPy .npy reader", () => {
  it("reads a C-ordered float16 matrix", () => {
    // 1.0, -2.0, 0.5, 0.25
    const matrix = parseNpy(buildNpy("<f2", 2, 2, float16Buffer([0x3c00, 0xc000, 0x3800, 0x3400])));

    expect(matrix.rows).toBe(2);
    expect(matrix.columns).toBe(2);
    expect(matrix.dtype).toBe("float16");
    expect(matrix.row(0)).toEqual([1, -2]);
    expect(matrix.row(1)).toEqual([0.5, 0.25]);
  });

  it("reads a C-ordered float32 matrix", () => {
    const matrix = parseNpy(buildNpy("<f4", 1, 3, float32Buffer([0.1, 0.2, 0.3])));

    expect(matrix.dtype).toBe("float32");
    expect(matrix.row(0)[0]).toBeCloseTo(0.1, 6);
    expect(matrix.row(0)[1]).toBeCloseTo(0.2, 6);
    expect(matrix.row(0)[2]).toBeCloseTo(0.3, 6);
  });

  it("rejects a row outside the matrix", () => {
    const matrix = parseNpy(buildNpy("<f2", 1, 1, float16Buffer([0x3c00])));
    expect(() => matrix.row(1)).toThrow(RangeError);
    expect(() => matrix.row(-1)).toThrow(RangeError);
  });

  it("rejects Fortran order, non-2-D shapes and big-endian data", () => {
    expect(() => parseNpy(buildNpy("<f2", 1, 1, float16Buffer([0x3c00]), true))).toThrow(
      /Fortran-ordered/,
    );

    expect(() =>
      parseNpy(
        buildNpyWithHeader(
          "{'descr': '<f2', 'fortran_order': False, 'shape': (2,), }",
          float16Buffer([0x3c00, 0x3c00]),
        ),
      ),
    ).toThrow(/2-D/);

    expect(() => parseNpy(buildNpy(">f2", 1, 1, float16Buffer([0x3c00])))).toThrow(/Big-endian/);
  });

  it("rejects a truncated payload and a bad magic", () => {
    const valid = buildNpy("<f2", 2, 2, float16Buffer([0x3c00, 0xc000, 0x3800, 0x3400]));
    expect(() => parseNpy(valid.subarray(0, valid.length - 2))).toThrow(/Truncated/);
    expect(() => parseNpy(Buffer.from("not a numpy file"))).toThrow(/bad magic/);
  });
});

describe("embedding normalization", () => {
  it("accepts unit vectors and rejects an unnormalized row", () => {
    const unit = parseNpy(buildNpy("<f4", 1, 2, float32Buffer([0.6, 0.8])));
    expect(() => assertNormalized(unit)).not.toThrow();

    const scaled = parseNpy(buildNpy("<f4", 1, 2, float32Buffer([1, 1])));
    expect(() => assertNormalized(scaled)).toThrow(/not L2-normalized/);
  });

  it("rejects non-finite values", () => {
    const matrix = parseNpy(buildNpy("<f4", 1, 2, float32Buffer([Number.NaN, 1])));
    expect(() => assertNormalized(matrix)).toThrow(/non-finite/);
  });
});
