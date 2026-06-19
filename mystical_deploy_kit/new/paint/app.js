// ── AI 및 OCR 모듈 인입 (네이티브 ESM CDN 연동 방식 적용) ───────────────────
import Tesseract from 'https://cdn.jsdelivr.net/npm/tesseract.js@5/+esm';
import { MysticalAI } from "./ai.js";

const mysticalAI = new MysticalAI("./best.onnx");
mysticalAI.init();

let aiTimeout = null;

// ── DOM ──────────────────────────────────────────────────────────────────────
const canvas     = document.getElementById("main-canvas");
const ctx        = canvas.getContext("2d");
const rangeInput = document.getElementById("range-input");
const colorInput = document.getElementById("color-input");
const clearBtn   = document.getElementById("clear-btn");
const saveBtn    = document.getElementById("save-btn");
const toolBtns   = document.querySelectorAll(".tool-btn");

const CANVAS_SIZE = 700;
canvas.width  = CANVAS_SIZE;
canvas.height = CANVAS_SIZE;

const GAP = 50;

// ── 상태 ─────────────────────────────────────────────────────────────────────
const state = {
    painting: false,
    tool: "brush",
    startX: 0,
    startY: 0,
    snapshot: null,
};

// ── 컨텍스트 초기화 ────────────────────────────────────────────────────────────
function initCtx() {
    ctx.strokeStyle = colorInput?.value ?? "#000000";
    ctx.lineWidth   = Number(rangeInput?.value ?? 1.0);
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
}
initCtx();

// ── 툴 활성화 ─────────────────────────────────────────────────────────────────
function setActiveTool(toolName) {
    state.tool = toolName;
    toolBtns.forEach((btn) => {
        const isActive = btn.dataset.tool === toolName;
        btn.classList.toggle("active",            isActive);
        btn.classList.toggle("btn-light",          isActive);
        btn.classList.toggle("btn-outline-light",  !isActive);
    });
}

document.querySelector(".sidebar").addEventListener("click", (e) => {
    const btn = e.target.closest(".tool-btn");
    if (btn) setActiveTool(btn.dataset.tool);
});

// ── xarray { } ───────────────────────────────────────────────────────────────
function drawXarray(cx, cy, r) {
    if (r <= GAP + 10) return; 
    const innerR = r - GAP;

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, 2 * Math.PI);
    ctx.stroke();

    const n      = 9;
    const graphR = innerR * 0.92;
    const pts    = [];
    for (let i = 0; i < n; i++) {
        const a = (i * 2 * Math.PI) / n - Math.PI / 2;
        pts.push({ x: cx + graphR * Math.cos(a), y: cy + graphR * Math.sin(a) });
    }
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.stroke();
        }
    }
}

// ── array [ ] ────────────────────────────────────────────────────────────────
function drawArray(cx, cy, r) {
    if (r <= GAP + 10) return;
    const innerR = r - GAP;

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, 2 * Math.PI);
    ctx.stroke();
}

// ── dict << >> ───────────────────────────────────────────────────────────────
function drawDict(cx, cy, r) {
    if (r <= GAP + 10) return;
    const sides  = 10;
    const outerR = r;
    const innerR = r - GAP;

    function polyPts(radius) {
        const pts = [];
        for (let i = 0; i < sides; i++) {
            const a = (i * 2 * Math.PI) / sides - Math.PI / 2;
            pts.push({ x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a), a });
        }
        return pts;
    }

    const outerPts = polyPts(outerR);
    const innerPts = polyPts(innerR);

    ctx.beginPath();
    outerPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath();
    innerPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.stroke();
}

// ── 통합 드로잉 디스패처 ─────────────────────────────────────────────────────
function drawShape(x, y) {
    switch (state.tool) {
        case "brush":
            ctx.lineTo(x, y);
            ctx.stroke();
            break;

        case "line":
            ctx.putImageData(state.snapshot, 0, 0);
            ctx.beginPath();
            ctx.moveTo(state.startX, state.startY);
            ctx.lineTo(x, y);
            ctx.stroke();
            break;

        case "xarray":
        case "array":
        case "dict": {
            ctx.putImageData(state.snapshot, 0, 0);
            const cx = state.startX;
            const cy = state.startY;
            const r  = Math.hypot(x - cx, y - cy);
            if (r < 10) break;

            if      (state.tool === "xarray")     drawXarray(cx, cy, r);
            else if (state.tool === "array")       drawArray (cx, cy, r);
            else if (state.tool === "dict")        drawDict  (cx, cy, r);
            break;
        }
    }
}

// ── 캔버스 이벤트 핸들러 ─────────────────────────────────────────────────────
function onMouseDown(e) {
    state.painting = true;
    state.startX   = e.offsetX;
    state.startY   = e.offsetY;

    if (state.tool !== "brush") {
        state.snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }
}

function onMouseMove(e) {
    const x = e.offsetX;
    const y = e.offsetY;

    if (!state.painting) {
        if (state.tool === "brush") {
            ctx.beginPath();
            ctx.moveTo(x, y);
        }
        return;
    }
    drawShape(x, y);
}

function onMouseUp(e) {
    if (!state.painting) return;
    state.painting = false;

    // 브러시 조작이 종료되어 캔버스 수정이 멈추는 시점부터 해석 가동
    if (state.tool === "brush") {
        clearTimeout(aiTimeout);
        aiTimeout = setTimeout(async () => {
            console.log("🔮 AI 기반 완전 자동화 인식 파이프라인 가동...");
            
            // 1. AI 예측 레이어로 변경 (detect -> predict)
            const detectedObjects = await mysticalAI.predict(canvas); 
            console.log("🎯 [분석 성공] 탐지된 기호 원본 리스트:", detectedObjects);

            // 2. AI 검출물 분리 및 좌표 역변환 스케일 바인딩
            const { rings, sigils } = processAIDetections(detectedObjects);

            // 3. 링 객체를 파싱하여 동적으로 위상 트리 계층 생성 (완전 자동화)
            const shapeTree = buildShapeTreeFromAI(rings);

            // 4. text_string 발견 시 링 외곽 트랙의 원형 언랩핑 및 OCR 비동기 판독 처리
            for (const sigil of sigils) {
                if (sigil.className === "text_string") {
                    const parentRing = rings.find(r => Math.hypot(sigil.cx - r.geometry.ringCenter.x, sigil.cy - r.geometry.ringCenter.y) <= r.outerR);
                    if (parentRing) {
                        const unwrappedCanvas = unwrapPolarText(canvas, parentRing.geometry.ringCenter.x, parentRing.geometry.ringCenter.y, parentRing.outerR);
                        sigil.literalText = await recognizeLiteralString(unwrappedCanvas);
                        console.log(`📝 [OCR 완료] 판독 결과: "${sigil.literalText}"`);
                    }
                }
            }

            // 5. 시질 기호를 소속 링에 분류하고, AI 제공 마커 오프셋을 기점으로 수학적 CCW 오름차순 정렬
            const sigilsByShape = rings.map(shape => {
                const assignedSigils = sigils.filter(s => {
                    const dist = Math.hypot(s.cx - shape.geometry.ringCenter.x, s.cy - shape.geometry.ringCenter.y);
                    return dist <= shape.innerR + Math.max(s.w, s.h) / 2;
                });
                return {
                    shape,
                    // 물리적 시작 지점 마커(startMarker)와 기하학적 정중앙(ringCenter) 기반 완벽 각도 매핑
                    sigils: sortCounterClockwise(assignedSigils, shape.geometry.ringCenter, shape.geometry.startMarker)
                };
            });

            // 최외곽 어떤 링에도 종속되지 않은 고아(orphan) 기호 격리
            const orphans = sigils.filter(s => !rings.some(r => Math.hypot(s.cx - r.geometry.ringCenter.x, s.cy - r.geometry.ringCenter.y) <= r.innerR + Math.max(s.w, s.h) / 2));
            if (orphans.length > 0) {
                sigilsByShape.push({ shape: null, sigils: orphans });
            }

            // 6. def Ligature 매크로 문맥 제어 및 계층 트리 구조에 맞게 PostScript 최종 합성
            const psCode = assemblePSCode(sigilsByShape, shapeTree);
            console.log("📜 [PostScript 해석 결과]\n" + psCode);

            const outputEl = document.getElementById("ps-output");
            if (outputEl) outputEl.textContent = psCode || "(탐지된 기호 없음)";

            if (psCode) {
                renderWithLambda(psCode);
            }

        }, 1000);
    }
}

canvas.addEventListener("mousedown",  onMouseDown);
canvas.addEventListener("mousemove",  onMouseMove);
canvas.addEventListener("mouseup",    onMouseUp);
canvas.addEventListener("mouseleave", () => { state.painting = false; });

// ── 컨트롤 이벤트 ────────────────────────────────────────────────────────────
rangeInput?.addEventListener("input", (e) => { ctx.lineWidth   = e.target.value; });
colorInput?.addEventListener("input", (e) => { ctx.strokeStyle = e.target.value; });

clearBtn?.addEventListener("click", () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    initCtx();
});

saveBtn?.addEventListener("click", () => {
    const link = document.createElement("a");
    link.href     = canvas.toDataURL("image/png");
    link.download = "painting.png";
    link.click();
});

// ── 고도화 파이프라인 컴파일러 연단 함수군 ─────────────────────────────────────

/**
 * 1. AI 예측 결과의 스케일 보정 및 구조화 분리
 */
function processAIDetections(detectedObjects) {
    const MODEL_TO_CANVAS = CANVAS_SIZE / mysticalAI.imgSize;

    // 링 레이어 검출 (geometry 속성이 존재하는 객체)
    const rings = detectedObjects
        .filter(obj => obj.geometry !== null)
        .map(r => {
            const cx = r.cx * MODEL_TO_CANVAS;
            const cy = r.cy * MODEL_TO_CANVAS;
            const w  = r.w  * MODEL_TO_CANVAS;
            const h  = r.h  * MODEL_TO_CANVAS;
            const outerR = Math.max(w, h) / 2;

            return {
                tool: r.className,
                cx: cx,
                cy: cy,
                outerR: outerR,
                innerR: outerR - GAP,
                children: [],
                geometry: {
                    ringCenter: {
                        x: r.geometry.ringCenter.x * MODEL_TO_CANVAS,
                        y: r.geometry.ringCenter.y * MODEL_TO_CANVAS
                    },
                    startMarker: {
                        x: r.geometry.startMarker.x * MODEL_TO_CANVAS,
                        y: r.geometry.startMarker.y * MODEL_TO_CANVAS
                    }
                }
            };
        });

    // 일반 시질 분할 (geometry 속성이 null인 객체)
    const sigils = detectedObjects
        .filter(obj => obj.geometry === null)
        .map(s => ({
            ...s,
            cx: s.cx * MODEL_TO_CANVAS,
            cy: s.cy * MODEL_TO_CANVAS,
            w:  s.w  * MODEL_TO_CANVAS,
            h:  s.h  * MODEL_TO_CANVAS
        }));

    return { rings, sigils };
}

/**
 * 2. 물리적 좌표 포함 관계를 활용한 동적 위상 정렬 트리 모델 구축
 */
function buildShapeTreeFromAI(rings) {
    rings.sort((a, b) => b.outerR - a.outerR);
    const roots = [];

    for (const node of rings) {
        let bestParent = null;
        let bestInnerR = Infinity;

        for (const candidate of rings) {
            if (candidate === node) continue;
            // 자식 노드의 중심점이 후보 상위 노드의 내부 트랙(innerR) 바운더리에 포함되는지 확인
            const dist = Math.hypot(node.cx - candidate.cx, node.cy - candidate.cy);
            if (dist < candidate.innerR && candidate.innerR < bestInnerR) {
                bestInnerR = candidate.innerR;
                bestParent = candidate;
            }
        }

        if (bestParent) {
            bestParent.children.push(node);
        } else {
            roots.push(node);
        }
    }
    return roots;
}

/**
 * 3-1. 원형으로 작성된 문자열 궤적을 OCR 판독용 평탄화 가로 스트립으로 가공 (Polar Unwrapping)
 */
function unwrapPolarText(sourceCanvas, cx, cy, radius) {
    const textWidth = Math.round(2 * Math.PI * radius);
    const textHeight = GAP;

    const offscreen = document.createElement("canvas");
    offscreen.width = textWidth;
    offscreen.height = textHeight;
    const oCtx = offscreen.getContext("2d");

    const srcCtx = sourceCanvas.getContext("2d");
    const srcData = srcCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
    const destData = oCtx.createImageData(textWidth, textHeight);

    for (let x = 0; x < textWidth; x++) {
        const angle = (x / textWidth) * 2 * Math.PI; // 3시 방향(0 rad) 기점 반시계 방향 매핑
        for (let y = 0; y < textHeight; y++) {
            const currentR = (radius - GAP) + y;
            
            const srcX = Math.round(cx + currentR * Math.cos(angle));
            const srcY = Math.round(cy + currentR * Math.sin(angle));

            if (srcX >= 0 && srcX < sourceCanvas.width && srcY >= 0 && srcY < sourceCanvas.height) {
                const srcIdx = (srcY * sourceCanvas.width + srcX) * 4;
                const destIdx = (y * textWidth + x) * 4;

                destData.data[destIdx]     = srcData.data[srcIdx];
                destData.data[destIdx + 1] = srcData.data[srcIdx + 1];
                destData.data[destIdx + 2] = srcData.data[srcIdx + 2];
                destData.data[destIdx + 3] = srcData.data[srcIdx + 3];
            }
        }
    }
    oCtx.putImageData(destData, 0, 0);
    return offscreen;
}

/**
 * 3-2. Tesseract.js 비동기 파이프라인 문자열 판독 처리
 */
async function recognizeLiteralString(unwrappedCanvas) {
    try {
        const worker = await Tesseract.createWorker('eng');
        const { data: { text } } = await worker.recognize(unwrappedCanvas);
        await worker.terminate();
        return text.trim().replace(/\s+/g, ' ');
    } catch (err) {
        console.error("🔴 [Tesseract OCR 모듈 장애]", err);
        return "OCR_FAILED";
    }
}

/**
 * 4. 기준점 마커(startMarker) 물리 상대 각도 변환 기반 반시계 방향(CCW) 정렬 알고리즘
 */
function sortCounterClockwise(sigils, ringCenter, startMarker) {
    if (!ringCenter || !startMarker) return sigils;

    const TWO_PI = 2 * Math.PI;

    // AI가 탐지해낸 물리 시작 마커의 데카르트 극좌표 기준 각도 산출
    const baseAngleRaw = Math.atan2(-(startMarker.y - ringCenter.y), startMarker.x - ringCenter.x);
    const baseAngle = ((baseAngleRaw % TWO_PI) + TWO_PI) % TWO_PI;

    return [...sigils].sort((a, b) => {
        const rawA = Math.atan2(-(a.cy - ringCenter.y), a.cx - ringCenter.x);
        const rawB = Math.atan2(-(b.cy - ringCenter.y), b.cx - ringCenter.x);

        const angleA = ((rawA % TWO_PI) + TWO_PI) % TWO_PI;
        const angleB = ((rawB % TWO_PI) + TWO_PI) % TWO_PI;

        // 시작 마커 기준 상대 오프셋 편차 산출
        let relativeA = angleA - baseAngle;
        let relativeB = angleB - baseAngle;

        relativeA = ((relativeA % TWO_PI) + TWO_PI) % TWO_PI;
        relativeB = ((relativeB % TWO_PI) + TWO_PI) % TWO_PI;

        return relativeA - relativeB; // 마커 기준 반시계 방향(0에서 2PI 방향) 점진적 오름차순 정렬 보장
    });
}

/**
 * 5. def Ligature 결합을 매크로화 처리하는 고도화된 PostScript 코드 컴파일러
 */
function assemblePSCode(sigilsByShape, shapeTree) {
    function toToken(className) {
        return className.replace(/^sigil_/, "");
    }

    function assembleOne(entry, innerEntries = []) {
        const { shape, sigils } = entry;
        if (!shape) return sigils.map(s => s.literalText ? `(${s.literalText})` : toToken(s.className)).join(" ");

        const tool = shape.tool;
        const rawTokens = [];

        for (const s of sigils) {
            if (s.className === "text_string" && s.literalText) {
                rawTokens.push(`(${s.literalText})`);
            } else {
                rawTokens.push(toToken(s.className));
            }
        }

        const finalizedTokens = [];
        const mutableInner = [...innerEntries]; // 스택 오염 방지 가공 사본 생성

        // def 키워드를 만날 시 직계 깊이의 후속 결합 링 데이터를 한 단계 축출하여 캡슐화 처리
        for (let i = 0; i < rawTokens.length; i++) {
            const currentToken = rawTokens[i];
            
            if (currentToken === "def") {
                const nextTargetRing = mutableInner.shift(); 
                if (nextTargetRing) {
                    const macroBody = assembleOne(nextTargetRing, nextTargetRing.shape.children || []);
                    finalizedTokens.push(`${macroBody} def`);
                } else {
                    finalizedTokens.push("def");
                }
            } else {
                finalizedTokens.push(currentToken);
            }
        }

        // 매크로 바인딩 영역에 결착되지 못하고 잔존한 구조체 순차 병합
        while (mutableInner.length > 0) {
            const remaining = mutableInner.shift();
            finalizedTokens.push(assembleOne(remaining, remaining.shape.children || []));
        }

        // PostScript 예약 컨테이너 구조화 서식 적용
        if (tool === "xarray") return `{ ${finalizedTokens.join(" ")} }`;
        if (tool === "array")  return `[ ${finalizedTokens.join(" ")} ]`;
        if (tool === "dict") {
            const pairs = [];
            for (let i = 0; i < finalizedTokens.length; i += 2) {
                const key = finalizedTokens[i];
                const val = finalizedTokens[i + 1] || "";
                const psKey = key.startsWith("/") ? key : `/${key}`;
                pairs.push(`    ${psKey} ${val}`);
            }
            return `<<\n${pairs.join("\n")}\n>>`;
        }
        return finalizedTokens.join(" ");
    }

    const parts = [];
    for (const rootShape of shapeTree) {
        const entry = sigilsByShape.find((e) => e.shape === rootShape) ?? { shape: rootShape, sigils: [] };
        const childShapes = rootShape.children ?? [];
        const childEntries = childShapes.map(
            (cs) => sigilsByShape.find((e) => e.shape === cs) ?? { shape: cs, sigils: [] }
        );
        parts.push(assembleOne(entry, childEntries));
    }

    const orphanEntry = sigilsByShape.find((e) => !e.shape);
    if (orphanEntry && orphanEntry.sigils.length > 0) {
        parts.push(assembleOne(orphanEntry, []));
    }

    if (parts.length === 0) return "";
    if (parts.length === 1) return parts[0];
    return parts.join("\n");
}

// ── Lambda 렌더링 연동 ────────────────────────────────────────────────────────
async function renderWithLambda(psCode) {
    const endpoint = window.LAMBDA_URL ?? null;
    if (!endpoint) {
        console.info("ℹ️ LAMBDA_URL 미설정 — 로컬 모드(PS 코드 출력만 수행)");
        setRenderStatus("idle", "LAMBDA_URL을 설정하면 렌더링 결과를 볼 수 있습니다.");
        return;
    }

    const modeEl = document.getElementById("render-mode");
    const mode   = modeEl ? modeEl.value : "magic";   

    setRenderStatus("loading", "렌더링 중…");

    try {
        const res = await fetch(endpoint, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ code: psCode, mode }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

        const { url } = await res.json();   
        showRenderResult(url);
        setRenderStatus("done", "렌더링 완료");
    } catch (err) {
        console.error("🔴 [Lambda 렌더링 오류]", err);
        setRenderStatus("error", `오류: ${err.message}`);
    }
}

function setRenderStatus(state, message) {
    const el = document.getElementById("render-status");
    if (!el) return;
    el.textContent = message;
    el.dataset.state = state;   
}

function showRenderResult(url) {
    const img = document.getElementById("render-img");
    if (!img) return;
    img.src   = url;
    img.style.display = "block";
}