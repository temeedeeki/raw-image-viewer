export type RawDataType =
  | "bool"
  | "uint8"
  | "int8"
  | "uint16"
  | "int16"
  | "uint32"
  | "int32"
  | "float32"
  | "float64";

export type RawEditorState = {
  fileName: string;
  width: number | null;
  height: number | null;
  depth: number | null;
  sliceIndex: number;
  dataType: RawDataType | null;
  zoom: number;
};

type TypedArrayCtor =
  | Uint8ArrayConstructor
  | Int8ArrayConstructor
  | Uint16ArrayConstructor
  | Int16ArrayConstructor
  | Uint32ArrayConstructor
  | Int32ArrayConstructor
  | Float32ArrayConstructor
  | Float64ArrayConstructor;

export const RAW_DATA_TYPE_INFO: Record<
  RawDataType,
  {
    label: string;
    bytesPerElement: number;
    ctor: TypedArrayCtor;
    binary?: boolean;
  }
> = {
  bool: {
    label: "boolean",
    bytesPerElement: 1,
    ctor: Uint8Array,
    binary: true,
  },
  uint8: {
    label: "8-bit unsigned integer",
    bytesPerElement: 1,
    ctor: Uint8Array,
  },
  int8: { label: "8-bit signed integer", bytesPerElement: 1, ctor: Int8Array },
  uint16: {
    label: "16-bit unsigned integer",
    bytesPerElement: 2,
    ctor: Uint16Array,
  },
  int16: {
    label: "16-bit signed integer",
    bytesPerElement: 2,
    ctor: Int16Array,
  },
  uint32: {
    label: "32-bit unsigned integer",
    bytesPerElement: 4,
    ctor: Uint32Array,
  },
  int32: {
    label: "32-bit signed integer",
    bytesPerElement: 4,
    ctor: Int32Array,
  },
  float32: { label: "32-bit float", bytesPerElement: 4, ctor: Float32Array },
  float64: { label: "64-bit float", bytesPerElement: 8, ctor: Float64Array },
};

export const RAW_DATA_TYPES = Object.keys(RAW_DATA_TYPE_INFO) as RawDataType[];

export function inferDataType(
  fileName: string,
  parentDirectoryName?: string,
): RawDataType | null {
  const candidates: RawDataType[] = [
    "bool",
    "float64",
    "float32",
    "uint32",
    "int32",
    "uint16",
    "int16",
    "uint8",
    "int8",
  ];

  return (
    findDataTypeInText(fileName, candidates) ??
    findDataTypeInText(parentDirectoryName, candidates) ??
    null
  );
}

export function inferDimensions(
  fileName: string,
  byteLength: number,
  parentDirectoryName?: string,
) {
  return (
    inferDimensionsFromText(fileName, byteLength) ??
    inferDimensionsFromText(parentDirectoryName, byteLength) ?? {
      width: null,
      height: null,
      depth: null,
    }
  );
}

function findDataTypeInText(
  text: string | undefined,
  candidates: RawDataType[],
): RawDataType | null {
  if (!text) {
    return null;
  }

  const lowered = text.toLowerCase();
  return candidates.find((candidate) => lowered.includes(candidate)) ?? null;
}

type DimensionCandidate = {
  width: number;
  height: number;
  depth: number;
  score: number;
};

function inferDimensionsFromText(text: string | undefined, byteLength: number) {
  if (!text) {
    return null;
  }

  const candidates = [
    ...collect3dCandidates(text, byteLength),
    ...collect2dCandidates(text, byteLength),
  ];

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => left.score - right.score);
  const bestCandidate = candidates[0];
  return {
    width: bestCandidate.width,
    height: bestCandidate.height,
    depth: bestCandidate.depth,
  };
}

function collect3dCandidates(text: string, byteLength: number) {
  const matches = [...text.matchAll(/(\d+)x(\d+)x(\d+)/gi)];

  return matches
    .map((match) => {
      const width = Math.max(1, Number.parseInt(match[1], 10));
      const height = Math.max(1, Number.parseInt(match[2], 10));
      const depth = Math.max(1, Number.parseInt(match[3], 10));
      const volume = width * height * depth;
      if (!isCompatibleElementCount(volume, byteLength)) {
        return null;
      }

      return {
        width,
        height,
        depth,
        score: 0,
      } satisfies DimensionCandidate;
    })
    .filter((candidate): candidate is DimensionCandidate => candidate !== null);
}

function collect2dCandidates(text: string, byteLength: number) {
  const matches = [...text.matchAll(/(\d+)x(\d+)/gi)];

  return matches
    .map((match) => {
      const width = Math.max(1, Number.parseInt(match[1], 10));
      const height = Math.max(1, Number.parseInt(match[2], 10));
      const area = width * height;

      if (!isCompatibleElementCount(area, byteLength)) {
        return null;
      }

      return {
        width,
        height,
        depth: 1,
        score: 1,
      } satisfies DimensionCandidate;
    })
    .filter((candidate): candidate is DimensionCandidate => candidate !== null);
}

function isCompatibleElementCount(elementCount: number, byteLength: number) {
  if (elementCount <= 0 || byteLength <= 0) {
    return false;
  }

  const bytesPerElement = byteLength / elementCount;
  return [1, 2, 4, 8].includes(bytesPerElement);
}

export function inferDataTypeFromDimensions(
  width: number | null,
  height: number | null,
  depth: number | null,
  byteLength: number,
): RawDataType | null {
  if (width === null || height === null || depth === null) {
    return null;
  }

  const elementCount = width * height * depth;
  if (elementCount <= 0 || byteLength <= 0 || byteLength % elementCount !== 0) {
    return null;
  }

  const bytesPerElement = byteLength / elementCount;
  switch (bytesPerElement) {
    case 1:
      return "uint8";
    case 2:
      return "uint16";
    case 4:
      return "float32";
    case 8:
      return "float64";
    default:
      return null;
  }
}

export function getTypedView(buffer: ArrayBuffer, dataType: RawDataType) {
  const info = RAW_DATA_TYPE_INFO[dataType];
  const usableBytes =
    buffer.byteLength - (buffer.byteLength % info.bytesPerElement);
  return new info.ctor(buffer.slice(0, usableBytes));
}
