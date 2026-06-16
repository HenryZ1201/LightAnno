<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";

import type { LayoutType } from "../types";

const props = defineProps<{
  imageSrc: string;
  layoutType: LayoutType;
  boundaries: [number, number];
}>();

const emit = defineEmits<{
  boundariesChange: [boundaries: [number, number]];
}>();

interface ImageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const SNAP_POINTS = [0.3333, 0.5, 0.6667];
const SNAP_TOLERANCE = 0.02;
const MIN_GAP = 0.02;
const HIT_TOLERANCE = 18;

const containerRef = ref<HTMLDivElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const canvasWidth = ref(900);
const canvasHeight = ref(560);
const imageElement = ref<HTMLImageElement | null>(null);
const imageRect = ref<ImageRect>({ x: 0, y: 0, width: 0, height: 0 });
const draggingIndex = ref<number | null>(null);
const hoverIndex = ref<number | null>(null);
const tooltip = ref<{ x: number; y: number; value: number } | null>(null);
const localBoundaries = ref<[number, number]>([...props.boundaries] as [number, number]);
const imageLoadState = ref<"loading" | "loaded" | "error">("loading");

let resizeObserver: ResizeObserver | null = null;

const activeBoundaries = computed(() => {
  if (props.layoutType === "unlabeled" || props.layoutType === "single") return [];
  if (props.layoutType === "dual") return [localBoundaries.value[0]];
  return localBoundaries.value;
});

watch(
  () => props.imageSrc,
  async () => {
    await loadImage();
    resizeCanvas();
    drawCanvas();
  },
  { immediate: true },
);

watch(
  () => [props.layoutType, ...props.boundaries],
  () => {
    if (draggingIndex.value === null) {
      localBoundaries.value = [...props.boundaries] as [number, number];
    }
    drawCanvas();
  },
);

onMounted(async () => {
  await nextTick();
  resizeObserver = new ResizeObserver(() => {
    resizeCanvas();
    drawCanvas();
  });
  if (containerRef.value) {
    resizeObserver.observe(containerRef.value);
  }
  resizeCanvas();
  drawCanvas();
  window.addEventListener("resize", handleWindowResize);
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  window.removeEventListener("resize", handleWindowResize);
});

async function loadImage(): Promise<void> {
  if (!props.imageSrc) return;

  const image = new Image();
  imageLoadState.value = "loading";

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Image failed to load"));
      image.src = props.imageSrc;
    });
    imageElement.value = image;
    imageLoadState.value = "loaded";
  } catch {
    imageElement.value = null;
    imageLoadState.value = "error";
  }
}

function resizeCanvas(): void {
  const container = containerRef.value;
  const image = imageElement.value;
  if (!container) return;

  const width = Math.max(container.clientWidth, 320);
  const aspectHeight = image ? width * (image.naturalHeight / image.naturalWidth) : 560;
  const height = Math.min(Math.max(aspectHeight, 420), 760);
  canvasWidth.value = width;
  canvasHeight.value = height;
}

function handleWindowResize(): void {
  resizeCanvas();
  drawCanvas();
}

function drawCanvas(): void {
  const canvas = canvasRef.value;
  const image = imageElement.value;
  if (!canvas) return;

  const context = canvas.getContext("2d");
  if (!context) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(canvasWidth.value * dpr);
  canvas.height = Math.floor(canvasHeight.value * dpr);
  canvas.style.width = `${canvasWidth.value}px`;
  canvas.style.height = `${canvasHeight.value}px`;

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, canvasWidth.value, canvasHeight.value);
  context.fillStyle = "#0f172a";
  context.fillRect(0, 0, canvasWidth.value, canvasHeight.value);

  if (!image) return;

  const rect = calculateImageRect(image, canvasWidth.value, canvasHeight.value);
  imageRect.value = rect;
  context.drawImage(image, rect.x, rect.y, rect.width, rect.height);

  drawInactiveRegions(context, rect);
  activeBoundaries.value.forEach((boundary, index) => {
    drawBoundaryLine(context, rect, boundary, index === hoverIndex.value || index === draggingIndex.value);
  });
}

function calculateImageRect(image: HTMLImageElement, width: number, height: number): ImageRect {
  const imageAspect = image.naturalWidth / image.naturalHeight;
  const canvasAspect = width / height;

  if (imageAspect > canvasAspect) {
    const renderWidth = width;
    const renderHeight = width / imageAspect;
    return { x: 0, y: (height - renderHeight) / 2, width: renderWidth, height: renderHeight };
  }

  const renderHeight = height;
  const renderWidth = height * imageAspect;
  return { x: (width - renderWidth) / 2, y: 0, width: renderWidth, height: renderHeight };
}

function drawInactiveRegions(context: CanvasRenderingContext2D, rect: ImageRect): void {
  context.strokeStyle = "rgba(255, 255, 255, 0.22)";
  context.lineWidth = 1;
  context.strokeRect(rect.x, rect.y, rect.width, rect.height);
}

function drawBoundaryLine(
  context: CanvasRenderingContext2D,
  rect: ImageRect,
  boundary: number,
  active: boolean,
): void {
  const x = rect.x + boundary * rect.width;
  context.save();
  context.strokeStyle = active ? "#38bdf8" : "#f97316";
  context.lineWidth = active ? 4 : 3;
  context.setLineDash(active ? [] : [8, 8]);
  context.beginPath();
  context.moveTo(x, rect.y);
  context.lineTo(x, rect.y + rect.height);
  context.stroke();

  context.fillStyle = active ? "#38bdf8" : "#f97316";
  context.beginPath();
  context.roundRect(x - 5, rect.y + rect.height / 2 - 28, 10, 56, 5);
  context.fill();
  context.restore();
}

function handlePointerDown(event: PointerEvent): void {
  const index = nearestBoundaryIndex(event);
  if (index === null) return;

  draggingIndex.value = index;
  canvasRef.value?.setPointerCapture(event.pointerId);
  updateBoundaryFromPointer(event);
}

function handlePointerMove(event: PointerEvent): void {
  if (draggingIndex.value !== null) {
    updateBoundaryFromPointer(event);
    return;
  }

  hoverIndex.value = nearestBoundaryIndex(event);
  canvasRef.value?.classList.toggle("is-hovering-line", hoverIndex.value !== null);
  drawCanvas();
}

function handlePointerUp(event: PointerEvent): void {
  if (draggingIndex.value !== null) {
    canvasRef.value?.releasePointerCapture(event.pointerId);
  }

  draggingIndex.value = null;
  tooltip.value = null;
  drawCanvas();
}

function updateBoundaryFromPointer(event: PointerEvent): void {
  if (draggingIndex.value === null) return;

  const rect = imageRect.value;
  const canvasRect = canvasRef.value?.getBoundingClientRect();
  if (!canvasRect || rect.width <= 0) return;

  const pointerX = event.clientX - canvasRect.left;
  let normalized = (pointerX - rect.x) / rect.width;
  normalized = clamp(normalized, 0.001, 0.999);
  normalized = snap(normalized);

  const next: [number, number] = [...localBoundaries.value] as [number, number];

  if (props.layoutType === "dual") {
    next[0] = normalized;
    next[1] = 0;
  } else if (props.layoutType === "triple") {
    if (draggingIndex.value === 0) {
      next[0] = Math.min(normalized, localBoundaries.value[1] - MIN_GAP);
    } else {
      next[1] = Math.max(normalized, localBoundaries.value[0] + MIN_GAP);
    }
  }

  next[0] = round4(clamp(next[0], 0, 1));
  next[1] = round4(clamp(next[1], 0, 1));
  tooltip.value = {
    x: rect.x + next[draggingIndex.value] * rect.width,
    y: Math.max(rect.y + 16, 16),
    value: next[draggingIndex.value],
  };

  localBoundaries.value = next;
  drawCanvas();
  emit("boundariesChange", next);
}

function nearestBoundaryIndex(event: PointerEvent): number | null {
  if (!activeBoundaries.value.length) return null;

  const rect = imageRect.value;
  const canvasRect = canvasRef.value?.getBoundingClientRect();
  if (!canvasRect) return null;

  const pointerX = event.clientX - canvasRect.left;
  const pointerY = event.clientY - canvasRect.top;
  const insideY = pointerY >= rect.y && pointerY <= rect.y + rect.height;
  if (!insideY) return null;

  let bestIndex: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  activeBoundaries.value.forEach((boundary, index) => {
    const x = rect.x + boundary * rect.width;
    const distance = Math.abs(pointerX - x);
    if (distance <= HIT_TOLERANCE && distance < bestDistance) {
      bestIndex = index;
      bestDistance = distance;
    }
  });

  return bestIndex;
}

function snap(value: number): number {
  const target = SNAP_POINTS.find((point) => Math.abs(value - point) <= SNAP_TOLERANCE);
  return target ?? value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
</script>

<template>
  <div ref="containerRef" class="boundary-canvas-wrap">
    <canvas
      ref="canvasRef"
      class="boundary-canvas"
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMove"
      @pointerup="handlePointerUp"
      @pointercancel="handlePointerUp"
      @pointerleave="handlePointerUp"
    ></canvas>

    <div v-if="imageLoadState === 'loading'" class="canvas-hint canvas-hint-warning">正在加载图片...</div>
    <div v-else-if="imageLoadState === 'error'" class="canvas-hint canvas-hint-warning">
      图片加载失败，请检查该 sample 的 image_path 路径
    </div>
    <div v-else-if="layoutType === 'unlabeled'" class="canvas-hint">请选择双栏或三栏后拖动竖线标注边界</div>
    <div v-else-if="layoutType === 'single'" class="canvas-hint">单栏模式，无需边界线</div>
    <div v-else class="canvas-hint">拖动橙色竖线调整边界，靠近 1/3、1/2、2/3 会自动吸附</div>
    <div
      v-if="tooltip"
      class="boundary-tooltip"
      :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }"
    >
      X={{ tooltip.value.toFixed(4) }}
    </div>
  </div>
</template>
