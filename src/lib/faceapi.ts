"use client";

// Pipeline facial de alta precisión:
// SCRFD-500M detecta cara + 5 puntos, y MobileFaceNet/ArcFace genera
// un embedding de 512 dimensiones. Todo corre localmente en el navegador.
import * as ort from "onnxruntime-web";

let detectorSession: ort.InferenceSession | null = null;
let recognizerSession: ort.InferenceSession | null = null;
let modelsLoaded = false;
let loadingPromise: Promise<void> | null = null;

const DETECTOR_URL = "/models/arcface/det_500m.onnx";
const RECOGNIZER_URL = "/models/arcface/w600k_mbf.onnx";
const DETECTOR_SIZE = 640;
const RECOGNIZER_SIZE = 112;
const DETECTION_THRESHOLD = 0.55;
const NMS_THRESHOLD = 0.4;
const STRIDES = [8, 16, 32] as const;
const NUM_ANCHORS = 2;

type Point = [number, number];

interface Detection {
  box: [number, number, number, number];
  score: number;
  kps: Point[];
}

export async function loadFaceApi() {
  if (modelsLoaded) return { detectorSession, recognizerSession };
  if (loadingPromise) {
    await loadingPromise;
    return { detectorSession, recognizerSession };
  }

  loadingPromise = (async () => {
    ort.env.wasm.wasmPaths = "/ort/";
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.simd = true;

    [detectorSession, recognizerSession] = await Promise.all([
      ort.InferenceSession.create(DETECTOR_URL, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      }),
      ort.InferenceSession.create(RECOGNIZER_URL, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      }),
    ]);
    modelsLoaded = true;
  })();

  await loadingPromise;
  return { detectorSession, recognizerSession };
}

export function isReady() {
  return modelsLoaded;
}

function drawSquareInput(
  input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  size: number
) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("No se pudo preparar canvas");

  const sourceWidth =
    input instanceof HTMLVideoElement
      ? input.videoWidth
      : input instanceof HTMLImageElement
      ? input.naturalWidth || input.width
      : input.width;
  const sourceHeight =
    input instanceof HTMLVideoElement
      ? input.videoHeight
      : input instanceof HTMLImageElement
      ? input.naturalHeight || input.height
      : input.height;

  if (!sourceWidth || !sourceHeight) return null;

  const scale = Math.max(size / sourceWidth, size / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const dx = (size - width) / 2;
  const dy = (size - height) / 2;
  ctx.drawImage(input, dx, dy, width, height);
  return canvas;
}

function canvasToDetectorTensor(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("No se pudo leer canvas");
  const { data } = ctx.getImageData(0, 0, DETECTOR_SIZE, DETECTOR_SIZE);
  const tensor = new Float32Array(1 * 3 * DETECTOR_SIZE * DETECTOR_SIZE);
  const plane = DETECTOR_SIZE * DETECTOR_SIZE;

  for (let i = 0; i < plane; i++) {
    const p = i * 4;
    tensor[i] = (data[p] - 127.5) / 128; // R
    tensor[plane + i] = (data[p + 1] - 127.5) / 128; // G
    tensor[plane * 2 + i] = (data[p + 2] - 127.5) / 128; // B
  }

  return new ort.Tensor("float32", tensor, [
    1,
    3,
    DETECTOR_SIZE,
    DETECTOR_SIZE,
  ]);
}

function generateAnchors(stride: number) {
  const anchors: Point[] = [];
  const height = DETECTOR_SIZE / stride;
  const width = DETECTOR_SIZE / stride;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let a = 0; a < NUM_ANCHORS; a++) {
        anchors.push([x * stride, y * stride]);
      }
    }
  }
  return anchors;
}

function decodeDetections(outputs: Record<string, ort.Tensor>) {
  const detections: Detection[] = [];
  const scoreNames = ["443", "468", "493"];
  const bboxNames = ["446", "471", "496"];
  const kpsNames = ["449", "474", "499"];

  for (let level = 0; level < STRIDES.length; level++) {
    const stride = STRIDES[level];
    const scores = outputs[scoreNames[level]].data as Float32Array;
    const bboxes = outputs[bboxNames[level]].data as Float32Array;
    const kps = outputs[kpsNames[level]].data as Float32Array;
    const anchors = generateAnchors(stride);

    for (let i = 0; i < scores.length; i++) {
      const score = scores[i];
      if (score < DETECTION_THRESHOLD) continue;

      const [cx, cy] = anchors[i];
      const b = i * 4;
      const box: Detection["box"] = [
        cx - bboxes[b] * stride,
        cy - bboxes[b + 1] * stride,
        cx + bboxes[b + 2] * stride,
        cy + bboxes[b + 3] * stride,
      ];

      const points: Point[] = [];
      const k = i * 10;
      for (let j = 0; j < 5; j++) {
        points.push([
          cx + kps[k + j * 2] * stride,
          cy + kps[k + j * 2 + 1] * stride,
        ]);
      }
      detections.push({ box, score, kps: points });
    }
  }

  return nonMaxSuppression(detections).sort((a, b) => b.score - a.score);
}

function iou(a: Detection["box"], b: Detection["box"]) {
  const x1 = Math.max(a[0], b[0]);
  const y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[2], b[2]);
  const y2 = Math.min(a[3], b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const areaA = Math.max(0, a[2] - a[0]) * Math.max(0, a[3] - a[1]);
  const areaB = Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
  return inter / (areaA + areaB - inter + 1e-6);
}

function nonMaxSuppression(detections: Detection[]) {
  const sorted = [...detections].sort((a, b) => b.score - a.score);
  const kept: Detection[] = [];
  while (sorted.length) {
    const best = sorted.shift()!;
    kept.push(best);
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (iou(best.box, sorted[i].box) > NMS_THRESHOLD) sorted.splice(i, 1);
    }
  }
  return kept;
}

function getSimilarityTransform(src: Point[], dst: Point[]) {
  const n = src.length;
  const srcMean: Point = [
    src.reduce((s, p) => s + p[0], 0) / n,
    src.reduce((s, p) => s + p[1], 0) / n,
  ];
  const dstMean: Point = [
    dst.reduce((s, p) => s + p[0], 0) / n,
    dst.reduce((s, p) => s + p[1], 0) / n,
  ];

  let denom = 0;
  let aNum = 0;
  let bNum = 0;
  for (let i = 0; i < n; i++) {
    const x = src[i][0] - srcMean[0];
    const y = src[i][1] - srcMean[1];
    const u = dst[i][0] - dstMean[0];
    const v = dst[i][1] - dstMean[1];
    denom += x * x + y * y;
    aNum += x * u + y * v;
    bNum += x * v - y * u;
  }

  const a = aNum / denom;
  const b = bNum / denom;
  const tx = dstMean[0] - a * srcMean[0] + b * srcMean[1];
  const ty = dstMean[1] - b * srcMean[0] - a * srcMean[1];
  return { a, b, tx, ty };
}

function alignFace(source: HTMLCanvasElement, kps: Point[]) {
  const reference: Point[] = [
    [38.2946, 51.6963],
    [73.5318, 51.5014],
    [56.0252, 71.7366],
    [41.5493, 92.3655],
    [70.7299, 92.2041],
  ];
  const { a, b, tx, ty } = getSimilarityTransform(kps, reference);
  const canvas = document.createElement("canvas");
  canvas.width = RECOGNIZER_SIZE;
  canvas.height = RECOGNIZER_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("No se pudo alinear cara");

  ctx.setTransform(a, b, -b, a, tx, ty);
  ctx.drawImage(source, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return canvas;
}

function canvasToRecognizerTensor(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("No se pudo leer cara alineada");
  const { data } = ctx.getImageData(0, 0, RECOGNIZER_SIZE, RECOGNIZER_SIZE);
  const plane = RECOGNIZER_SIZE * RECOGNIZER_SIZE;
  const tensor = new Float32Array(1 * 3 * plane);

  for (let i = 0; i < plane; i++) {
    const p = i * 4;
    tensor[i] = (data[p] - 127.5) / 127.5;
    tensor[plane + i] = (data[p + 1] - 127.5) / 127.5;
    tensor[plane * 2 + i] = (data[p + 2] - 127.5) / 127.5;
  }

  return new ort.Tensor("float32", tensor, [
    1,
    3,
    RECOGNIZER_SIZE,
    RECOGNIZER_SIZE,
  ]);
}

function l2Normalize(values: Float32Array) {
  let norm = 0;
  for (const v of values) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return Float32Array.from(values, (v) => v / norm);
}

// Obtiene el descriptor ArcFace (512 floats) de una sola cara.
export async function getSingleDescriptor(
  input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
): Promise<Float32Array | null> {
  await loadFaceApi();
  if (!detectorSession || !recognizerSession) return null;

  const detectorCanvas = drawSquareInput(input, DETECTOR_SIZE);
  if (!detectorCanvas) return null;

  const detectorInput = canvasToDetectorTensor(detectorCanvas);
  const detectorOutputs = await detectorSession.run({
    [detectorSession.inputNames[0]]: detectorInput,
  });
  const detections = decodeDetections(detectorOutputs);
  if (detections.length === 0) return null;

  const aligned = alignFace(detectorCanvas, detections[0].kps);
  const recognizerInput = canvasToRecognizerTensor(aligned);
  const recognizerOutputs = await recognizerSession.run({
    [recognizerSession.inputNames[0]]: recognizerInput,
  });
  const output = recognizerOutputs[recognizerSession.outputNames[0]]
    .data as Float32Array;

  return l2Normalize(output);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / ((Math.sqrt(normA) || 1) * (Math.sqrt(normB) || 1));
}

export interface MatchEntry {
  rut: string;
  nombre: string;
  curso: string;
  perteneceAlmuerzo: boolean;
  descriptor: number[];
}

export interface MatchResult {
  entry: MatchEntry;
  score: number;
  ambiguous?: boolean;
  candidates?: MatchResult[];
}

// Busca la mejor coincidencia con coseno. Mayor = más parecido.
export function findBestMatch(
  descriptor: Float32Array | number[],
  entries: MatchEntry[],
  threshold = 0.42,
  ambiguityMargin = 0.04
): MatchResult | null {
  const desc = Array.from(descriptor);
  const matches: MatchResult[] = [];
  for (const entry of entries) {
    if (!entry.descriptor || entry.descriptor.length !== desc.length) continue;
    const score = cosineSimilarity(desc, entry.descriptor);
    matches.push({ entry, score });
  }

  matches.sort((a, b) => b.score - a.score);
  const best = matches[0];
  if (!best || best.score < threshold) return null;

  const candidates = matches.filter(
    (m) => best.score - m.score <= ambiguityMargin
  );
  return {
    ...best,
    ambiguous: candidates.length > 1,
    candidates: candidates.slice(0, 3),
  };
}
