// Encoding: UTF-8
// Author: @temeedeeki

import "./styles.css";
import { getTypedView, RAW_DATA_TYPE_INFO } from "../shared/raw";
import type { RawDataType, RawEditorState } from "../shared/raw";

type BootstrapPayload = {
  initialState: RawEditorState;
  fileDataBase64: string;
};

type ViewerState = RawEditorState & {
  overrideMin: number | null;
  overrideMax: number | null;
};

type Elements = {
  controls: HTMLFormElement;
  widthInput: HTMLInputElement;
  heightInput: HTMLInputElement;
  depthInput: HTMLInputElement;
  sliceInput: HTMLInputElement;
  selectToggle: HTMLButtonElement;
  selectOptions: HTMLUListElement;
  zoomInput: HTMLInputElement;
  zoomValue: HTMLSpanElement;
  fileNameLabel: HTMLSpanElement;
  dataInfoLabel: HTMLSpanElement;
  warningLabel: HTMLSpanElement;
  noticeLabel: HTMLSpanElement;
  savePngButton: HTMLButtonElement;
  resetRangeButton: HTMLButtonElement;
  statsArea: HTMLSpanElement;
  statsMean: HTMLSpanElement;
  statsMin: HTMLSpanElement;
  statsMax: HTMLSpanElement;
  statsSum: HTMLSpanElement;
  minInput: HTMLInputElement;
  maxInput: HTMLInputElement;
  minRange: HTMLInputElement;
  maxRange: HTMLInputElement;
  canvas: HTMLCanvasElement;
  canvasWrap: HTMLDivElement;
  ctx: CanvasRenderingContext2D;
};

type SummaryStats = {
  area: number;
  mean: number;
  min: number;
  max: number;
  sum: number;
};

type RenderCache = {
  overallStatsKey: string | null;
  overallStats: SummaryStats | null;
};

type RangeChangeSource = "min" | "max";

const FALLBACK_CANVAS_SIZE = 128;
const SLICE_WHEEL_STEP_THRESHOLD = 100;

function main() {
  const bootstrap = readBootstrap();
  const elements = getElements();
  const state: ViewerState = {
    ...bootstrap.initialState,
    zoom: Number(bootstrap.initialState.zoom) || 1,
    sliceIndex: Number(bootstrap.initialState.sliceIndex) || 0,
    overrideMin: null,
    overrideMax: null,
  };
  const rawBuffer = base64ToArrayBuffer(bootstrap.fileDataBase64);
  const renderCache: RenderCache = {
    overallStatsKey: null,
    overallStats: null,
  };
  let sliceWheelDelta = 0;

  wireEvents(elements, state, rawBuffer, renderCache, {
    get sliceWheelDelta() {
      return sliceWheelDelta;
    },
    set sliceWheelDelta(value: number) {
      sliceWheelDelta = value;
    },
  });
  syncInputs(elements, state);
  renderCurrentSlice(elements, state, rawBuffer, renderCache);
}

function readBootstrap(): BootstrapPayload {
  const bootstrapNode = document.getElementById("bootstrap");
  if (!(bootstrapNode instanceof HTMLScriptElement)) {
    throw new Error("Bootstrap data not found.");
  }

  return JSON.parse(bootstrapNode.textContent || "") as BootstrapPayload;
}

function getElements(): Elements {
  const canvas = getRequiredElement("canvas", HTMLCanvasElement);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context is not available.");
  }

  return {
    controls: getRequiredElement("controls", HTMLFormElement),
    widthInput: getRequiredElement("width", HTMLInputElement),
    heightInput: getRequiredElement("height", HTMLInputElement),
    depthInput: getRequiredElement("depth", HTMLInputElement),
    sliceInput: getRequiredElement("slice", HTMLInputElement),
    selectToggle: getRequiredElement("selectToggle", HTMLButtonElement),
    selectOptions: getRequiredElement("selectOptions", HTMLUListElement),
    zoomInput: getRequiredElement("zoom", HTMLInputElement),
    zoomValue: getRequiredElement("zoomValue", HTMLSpanElement),
    fileNameLabel: getRequiredElement("fileName", HTMLSpanElement),
    dataInfoLabel: getRequiredElement("dataInfo", HTMLSpanElement),
    warningLabel: getRequiredElement("warning", HTMLSpanElement),
    noticeLabel: getRequiredElement("notice", HTMLSpanElement),
    savePngButton: getRequiredElement("savePngButton", HTMLButtonElement),
    resetRangeButton: getRequiredElement("resetRangeButton", HTMLButtonElement),
    statsArea: getRequiredElement("statsArea", HTMLSpanElement),
    statsMean: getRequiredElement("statsMean", HTMLSpanElement),
    statsMin: getRequiredElement("statsMin", HTMLSpanElement),
    statsMax: getRequiredElement("statsMax", HTMLSpanElement),
    statsSum: getRequiredElement("statsSum", HTMLSpanElement),
    minInput: getRequiredElement("minVal", HTMLInputElement),
    maxInput: getRequiredElement("maxVal", HTMLInputElement),
    minRange: getRequiredElement("minRange", HTMLInputElement),
    maxRange: getRequiredElement("maxRange", HTMLInputElement),
    canvas,
    canvasWrap: getRequiredElementBySelector(".canvas-wrap", HTMLDivElement),
    ctx,
  };
}

function wireEvents(
  elements: Elements,
  state: ViewerState,
  rawBuffer: ArrayBuffer,
  renderCache: RenderCache,
  interactionState: { sliceWheelDelta: number },
) {
  const rerender = () =>
    renderCurrentSlice(elements, state, rawBuffer, renderCache);

  elements.controls.addEventListener("submit", (event) => {
    event.preventDefault();
  });

  elements.widthInput.addEventListener("input", rerender);
  elements.heightInput.addEventListener("input", rerender);
  elements.depthInput.addEventListener("input", rerender);

  elements.sliceInput.addEventListener("input", () => {
    state.sliceIndex = Number(elements.sliceInput.value) || 0;
    syncSliceControl(elements, state);
    rerender();
  });

  elements.zoomInput.addEventListener("input", () => {
    state.zoom = Number(elements.zoomInput.value) || 1;
    syncZoomLabel(elements, state);
    applyZoom(elements, state);
  });

  elements.minInput.addEventListener("input", () => {
    state.overrideMin = parseNullableNumber(elements.minInput.value);
    clampOverrideRange(elements, state, "min");
    rerender();
  });

  elements.maxInput.addEventListener("input", () => {
    state.overrideMax = parseNullableNumber(elements.maxInput.value);
    clampOverrideRange(elements, state, "max");
    rerender();
  });

  elements.minRange.addEventListener("input", () => {
    state.overrideMin = parseNullableNumber(elements.minRange.value);
    if (state.overrideMin !== null) {
      elements.minInput.value = String(state.overrideMin);
    }
    clampOverrideRange(elements, state, "min");
    rerender();
  });

  elements.maxRange.addEventListener("input", () => {
    state.overrideMax = parseNullableNumber(elements.maxRange.value);
    if (state.overrideMax !== null) {
      elements.maxInput.value = String(state.overrideMax);
    }
    clampOverrideRange(elements, state, "max");
    rerender();
  });

  elements.savePngButton.addEventListener("click", () => {
    saveCanvasAsPng(elements, state);
  });

  elements.resetRangeButton.addEventListener("click", () => {
    state.overrideMin = null;
    state.overrideMax = null;
    rerender();
  });

  elements.selectToggle.addEventListener("click", () => {
    elements.selectOptions.toggleAttribute("hidden");
  });

  elements.selectOptions.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLLIElement)) {
      return;
    }

    const value = target.dataset.value;
    if (!isRawDataType(value)) {
      return;
    }

    state.dataType = value;
    state.overrideMin = null;
    state.overrideMax = null;
    elements.selectToggle.textContent = RAW_DATA_TYPE_INFO[value].label;
    elements.selectOptions.setAttribute("hidden", "");
    rerender();
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }

    if (
      !elements.selectToggle.contains(target) &&
      !elements.selectOptions.contains(target)
    ) {
      elements.selectOptions.setAttribute("hidden", "");
    }
  });

  elements.canvasWrap.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      if (event.ctrlKey) {
        const step = event.deltaY < 0 ? 0.25 : -0.25;
        state.zoom = Math.min(16, Math.max(0.25, state.zoom + step));
        elements.zoomInput.value = String(state.zoom);
        syncZoomLabel(elements, state);
        applyZoom(elements, state);
        return;
      }

      interactionState.sliceWheelDelta += event.deltaY;
      if (
        Math.abs(interactionState.sliceWheelDelta) < SLICE_WHEEL_STEP_THRESHOLD
      ) {
        return;
      }

      const delta = Math.trunc(
        interactionState.sliceWheelDelta / SLICE_WHEEL_STEP_THRESHOLD,
      );
      interactionState.sliceWheelDelta -= delta * SLICE_WHEEL_STEP_THRESHOLD;
      const maxSlice = Math.max(0, (state.depth ?? 1) - 1);
      state.sliceIndex = Math.min(
        maxSlice,
        Math.max(0, state.sliceIndex + delta),
      );
      elements.sliceInput.value = String(state.sliceIndex);
      syncSliceControl(elements, state);
      rerender();
    },
    { passive: false },
  );

  window.addEventListener("keydown", (event) => {
    const active = document.activeElement;
    if (
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      active instanceof HTMLSelectElement
    ) {
      return;
    }

    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const delta = event.key === "ArrowRight" ? 1 : -1;
      const maxSlice = Math.max(0, (state.depth ?? 1) - 1);
      state.sliceIndex = Math.min(
        maxSlice,
        Math.max(0, state.sliceIndex + delta),
      );
      elements.sliceInput.value = String(state.sliceIndex);
      syncSliceControl(elements, state);
      rerender();
    }
  });

  window.addEventListener("resize", () => {
    updateSliceInputWidth(elements);
  });

  window.addEventListener("error", (event) => {
    reportError(elements, "Runtime error: ", event.error || event.message);
  });

  window.addEventListener("unhandledrejection", (event) => {
    reportError(elements, "Runtime error: ", event.reason);
  });
}

function syncInputs(elements: Elements, state: ViewerState) {
  elements.fileNameLabel.textContent = state.fileName;
  elements.widthInput.value = nullableNumberToString(state.width);
  elements.heightInput.value = nullableNumberToString(state.height);
  elements.depthInput.value = nullableNumberToString(state.depth);
  elements.zoomInput.value = String(state.zoom);
  elements.selectToggle.textContent =
    state.dataType === null
      ? "Select data type"
      : RAW_DATA_TYPE_INFO[state.dataType].label;

  syncSliceControl(elements, state);
  syncZoomLabel(elements, state);
}

function syncZoomLabel(elements: Elements, state: ViewerState) {
  elements.zoomValue.textContent = `${state.zoom.toFixed(2)}x`;
}

function syncSliceControl(elements: Elements, state: ViewerState) {
  state.width = parseDimension(elements.widthInput.value);
  state.height = parseDimension(elements.heightInput.value);
  state.depth = parseDimension(elements.depthInput.value);

  if (state.depth === null) {
    elements.sliceInput.disabled = true;
    elements.sliceInput.value = "0";
    return;
  }

  state.sliceIndex = Math.min(Math.max(0, state.sliceIndex), state.depth - 1);
  elements.sliceInput.max = String(state.depth - 1);
  elements.sliceInput.disabled = state.depth <= 1;
  elements.sliceInput.value = String(state.sliceIndex);
}

function renderCurrentSlice(
  elements: Elements,
  state: ViewerState,
  rawBuffer: ArrayBuffer,
  renderCache: RenderCache,
) {
  try {
    syncSliceControl(elements, state);
    syncZoomLabel(elements, state);
    clearMessages(elements);

    if (state.width === null || state.height === null || state.depth === null) {
      elements.noticeLabel.textContent =
        "Image shape could not be inferred from the filename. Enter width, height, and depth to preview this RAW file.";
      drawFallbackCanvas(elements);
      clearStats(elements);
      return;
    }

    if (state.dataType === null) {
      elements.noticeLabel.textContent =
        "Select a data type to preview this RAW file.";
      drawFallbackCanvas(elements);
      clearStats(elements);
      return;
    }

    const view = getTypedView(rawBuffer, state.dataType);
    const pixelsPerSlice = state.width * state.height;
    const sliceOffset = state.sliceIndex * pixelsPerSlice;
    const slice = view.subarray(
      sliceOffset,
      Math.min(view.length, sliceOffset + pixelsPerSlice),
    );
    const sliceStats = getSummaryStats(slice);
    const overallStats = getOverallStats(view, state.dataType, renderCache);
    const dataRange = getDataRange(slice);
    configureRangeControls(elements, state, dataRange);

    const useMin = state.overrideMin ?? dataRange.min;
    const useMax = state.overrideMax ?? dataRange.max;
    drawSlice(
      elements,
      slice,
      state.width,
      state.height,
      state.dataType,
      useMin,
      useMax,
    );
    applyZoom(elements, state);
    updateSliceInputWidth(elements);
    updateStats(elements, sliceStats, overallStats);

    const expectedCount = pixelsPerSlice * state.depth;
    const byteCount =
      view.length * RAW_DATA_TYPE_INFO[state.dataType].bytesPerElement;
    elements.dataInfoLabel.textContent = `${state.sliceIndex + 1}/${state.depth}; ${state.width}x${state.height} pixels; Data elements: ${view.length}; Bytes: ${byteCount}`;
    if (view.length < expectedCount) {
      elements.warningLabel.textContent =
        "Data elements less than expected. Missing areas are shown in black.";
    }
  } catch (error) {
    reportError(elements, "Render failed: ", error);
  }
}

function configureRangeControls(
  elements: Elements,
  state: ViewerState,
  dataRange: { min: number; max: number },
) {
  const isUnsigned =
    state.dataType !== null &&
    (state.dataType.startsWith("uint") || state.dataType === "bool");
  const lowerBound = isUnsigned ? 0 : Math.min(0, dataRange.min);
  const currentMin = Math.max(lowerBound, state.overrideMin ?? dataRange.min);
  const currentMax = state.overrideMax ?? dataRange.max;

  elements.minRange.min = String(lowerBound);
  elements.minRange.max = String(dataRange.max);
  elements.maxRange.min = String(lowerBound);
  elements.maxRange.max = String(dataRange.max);
  elements.minRange.value = String(currentMin);
  elements.maxRange.value = String(currentMax);
  elements.minInput.min = String(lowerBound);
  elements.maxInput.min = String(lowerBound);
  elements.minInput.value = String(currentMin);
  elements.maxInput.value = String(currentMax);
}

function drawSlice(
  elements: Elements,
  data: ArrayLike<number>,
  width: number,
  height: number,
  dataType: RawDataType,
  min: number,
  max: number,
) {
  const { canvas, ctx, warningLabel } = elements;
  canvas.width = width;
  canvas.height = height;

  const imageData = ctx.createImageData(width, height);
  imageData.data.fill(0);

  const pixelCount = width * height;
  const usablePixels = Math.min(data.length, pixelCount);
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    imageData.data[pixel * 4 + 3] = 255;
  }

  if (usablePixels === 0) {
    ctx.putImageData(imageData, 0, 0);
    return;
  }

  if (RAW_DATA_TYPE_INFO[dataType].binary) {
    for (let index = 0; index < usablePixels; index += 1) {
      const shade = data[index] ? 255 : 0;
      const offset = index * 4;
      imageData.data[offset] = shade;
      imageData.data[offset + 1] = shade;
      imageData.data[offset + 2] = shade;
    }
    ctx.putImageData(imageData, 0, 0);
    return;
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    warningLabel.textContent = "No displayable numeric values found.";
    ctx.putImageData(imageData, 0, 0);
    return;
  }

  const range = max - min || 1;
  for (let index = 0; index < usablePixels; index += 1) {
    const normalized = ((data[index] - min) / range) * 255;
    const shade = Math.max(0, Math.min(255, normalized));
    const offset = index * 4;
    imageData.data[offset] = shade;
    imageData.data[offset + 1] = shade;
    imageData.data[offset + 2] = shade;
  }

  ctx.putImageData(imageData, 0, 0);
}

function applyZoom(elements: Elements, state: ViewerState) {
  const zoom = Math.max(0.25, Number(state.zoom) || 1);
  elements.canvas.style.width = `${elements.canvas.width * zoom}px`;
  elements.canvas.style.height = `${elements.canvas.height * zoom}px`;
  updateSliceInputWidth(elements);
}

function updateSliceInputWidth(elements: Elements) {
  const rect = elements.canvas.getBoundingClientRect();
  elements.sliceInput.style.width = `${Math.max(80, Math.floor(rect.width))}px`;
}

function getDataRange(data: ArrayLike<number>) {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < data.length; index += 1) {
    const value = data[index];
    if (!Number.isFinite(value)) {
      continue;
    }
    if (value < min) {
      min = value;
    }
    if (value > max) {
      max = value;
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, max: 1 };
  }

  return { min, max };
}

function getSummaryStats(data: ArrayLike<number>): SummaryStats {
  let area = 0;
  let sum = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < data.length; index += 1) {
    const value = data[index];
    if (!Number.isFinite(value)) {
      continue;
    }

    area += 1;
    sum += value;
    if (value < min) {
      min = value;
    }
    if (value > max) {
      max = value;
    }
  }

  if (area === 0) {
    return {
      area: 0,
      mean: Number.NaN,
      min: Number.NaN,
      max: Number.NaN,
      sum: 0,
    };
  }

  return {
    area,
    mean: sum / area,
    min,
    max,
    sum,
  };
}

function getOverallStats(
  view: ArrayLike<number>,
  dataType: RawDataType,
  renderCache: RenderCache,
) {
  const key = `${dataType}:${view.length}`;
  if (
    renderCache.overallStatsKey === key &&
    renderCache.overallStats !== null
  ) {
    return renderCache.overallStats;
  }

  const overallStats = getSummaryStats(view);
  renderCache.overallStatsKey = key;
  renderCache.overallStats = overallStats;
  return overallStats;
}

function updateStats(
  elements: Elements,
  sliceStats: SummaryStats,
  overallStats: SummaryStats,
) {
  elements.statsArea.textContent = formatStatsValue(
    sliceStats.area,
    overallStats.area,
    true,
  );
  elements.statsMean.textContent = formatStatsValue(
    sliceStats.mean,
    overallStats.mean,
  );
  elements.statsMin.textContent = formatStatsValue(
    sliceStats.min,
    overallStats.min,
  );
  elements.statsMax.textContent = formatStatsValue(
    sliceStats.max,
    overallStats.max,
  );
  elements.statsSum.textContent = formatStatsValue(
    sliceStats.sum,
    overallStats.sum,
  );
}

function clearStats(elements: Elements) {
  elements.statsArea.textContent = "-";
  elements.statsMean.textContent = "-";
  elements.statsMin.textContent = "-";
  elements.statsMax.textContent = "-";
  elements.statsSum.textContent = "-";
}

function saveCanvasAsPng(elements: Elements, state: ViewerState) {
  const link = document.createElement("a");
  const baseName = state.fileName.replace(/\.[^./\\]+$/, "");
  const sliceSuffix =
    state.depth !== null && state.depth > 1
      ? `_slice-${String(state.sliceIndex).padStart(3, "0")}`
      : "";
  link.download = `${baseName}${sliceSuffix}.png`;
  link.href = elements.canvas.toDataURL("image/png");
  link.click();
}

function formatStatsValue(
  sliceValue: number,
  overallValue: number,
  integer = false,
) {
  return `${formatNumber(sliceValue, integer)} (${formatNumber(overallValue, integer)})`;
}

function formatNumber(value: number, integer = false) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  if (integer) {
    return Math.round(value).toLocaleString();
  }

  return value.toLocaleString(undefined, {
    maximumFractionDigits: 6,
  });
}

function clampOverrideRange(
  elements: Elements,
  state: ViewerState,
  source: RangeChangeSource,
) {
  const isUnsigned =
    state.dataType !== null &&
    (state.dataType.startsWith("uint") || state.dataType === "bool");

  if (isUnsigned && state.overrideMin !== null && state.overrideMin < 0) {
    state.overrideMin = 0;
  }

  if (
    state.overrideMin !== null &&
    state.overrideMax !== null &&
    state.overrideMin > state.overrideMax
  ) {
    if (source === "min") {
      state.overrideMax = state.overrideMin;
    } else {
      state.overrideMin = state.overrideMax;
    }
  }

  elements.minInput.value = nullableNumberToString(state.overrideMin);
  elements.maxInput.value = nullableNumberToString(state.overrideMax);
  elements.minRange.value = nullableNumberToString(state.overrideMin);
  elements.maxRange.value = nullableNumberToString(state.overrideMax);
}

function clearCanvas(elements: Elements) {
  elements.ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
}

function drawFallbackCanvas(elements: Elements) {
  elements.canvas.width = FALLBACK_CANVAS_SIZE;
  elements.canvas.height = FALLBACK_CANVAS_SIZE;

  const imageData = elements.ctx.createImageData(
    FALLBACK_CANVAS_SIZE,
    FALLBACK_CANVAS_SIZE,
  );
  for (
    let pixel = 0;
    pixel < FALLBACK_CANVAS_SIZE * FALLBACK_CANVAS_SIZE;
    pixel += 1
  ) {
    imageData.data[pixel * 4 + 3] = 255;
  }

  elements.ctx.putImageData(imageData, 0, 0);
  elements.canvas.style.width = `${FALLBACK_CANVAS_SIZE}px`;
  elements.canvas.style.height = `${FALLBACK_CANVAS_SIZE}px`;
  updateSliceInputWidth(elements);
}

function clearMessages(elements: Elements) {
  elements.dataInfoLabel.textContent = "";
  elements.warningLabel.textContent = "";
  elements.noticeLabel.textContent = "";
}

function reportError(elements: Elements, prefix: string, error: unknown) {
  clearMessages(elements);
  elements.warningLabel.textContent = `${prefix}${toErrorMessage(error)}`;
  console.error(error);
}

function parseDimension(value: string) {
  if (!value) {
    return null;
  }
  return Math.max(1, Number.parseInt(value, 10) || 1);
}

function parseNullableNumber(value: string) {
  if (value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function base64ToArrayBuffer(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function nullableNumberToString(value: number | null) {
  return value === null ? "" : String(value);
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isRawDataType(value: string | undefined): value is RawDataType {
  return value !== undefined && value in RAW_DATA_TYPE_INFO;
}

function getRequiredElement<T extends typeof HTMLElement>(
  id: string,
  ctor: T,
): InstanceType<T> {
  const element = document.getElementById(id);
  if (!(element instanceof ctor)) {
    throw new Error(`Required element #${id} not found.`);
  }
  return element as InstanceType<T>;
}

function getRequiredElementBySelector<T extends typeof HTMLElement>(
  selector: string,
  ctor: T,
): InstanceType<T> {
  const element = document.querySelector(selector);
  if (!(element instanceof ctor)) {
    throw new Error(`Required element ${selector} not found.`);
  }
  return element as InstanceType<T>;
}

main();
