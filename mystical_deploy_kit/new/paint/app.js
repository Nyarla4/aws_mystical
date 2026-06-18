// ── AI 적용부 ───────────────────────────────────────────────────────────────
import { MysticalAI } from "./ai.js";

const mysticalAI = new MysticalAI("./best.onnx");
mysticalAI.init();

let aiTimeout = null;

// ── 도형 레지스트리 ───────────────────────────────────────────────────────────
// drawShape() 확정 시점(mouseup)에 그려진 틀 도형 정보를 누적 저장합니다.
// 각 항목: { tool: "array"|"dict"|"xarray", cx, cy, outerR, innerR }
const drawnShapes = [];

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
/**
 *   - 외곽 원 (outer border)
 *   - 내부 원 (inner border) → 두 원 사이의 링이 rim
 *   - inner circle 위에 complete graph (K9) — 모든 점 쌍 연결
 */
function drawXarray(cx, cy, r) {
    // 마법진이 너무 작아 GAP보다 작아지는 경우 방지 최소 반지름 설정
    if (r <= GAP + 10) return; 
    
    const innerR = r - GAP; // 고정된 GAP만큼 작은 내부 반지름 계산

    // 외곽 원
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.stroke();

    // 내부 원
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, 2 * Math.PI);
    ctx.stroke();

    // inner circle 위에 complete graph (K9)
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
/**
 *   - 외곽 원 + 내부 원 (xarray와 동일한 이중 원 구조)
 *   - inner circle은 비어있음 (complete graph 없음)
 *   - 3시 방향에 삼각형 sigil (▷) — start/end 마커
 */
function drawArray(cx, cy, r) {
    if (r <= GAP + 10) return;

    const innerR = r - GAP; // 고정된 GAP 적용

    // 외곽 원
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.stroke();

    // 내부 원
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, 2 * Math.PI);
    ctx.stroke();
}

// ── dict << >> ───────────────────────────────────────────────────────────────
/**
 * 이미지 분석:
 *   - 이중 10각형 (outer polygon + slightly smaller inner polygon)
 *   - 각 꼭짓점에서 내부로 뻗는 삼각형 (꼭짓점 → 중심 방향)
 *   - 삼각형은 /key (value) 쌍을 나타내는 sigil
 */
function drawDict(cx, cy, r) {
    if (r <= GAP + 10) return;

    const sides  = 10;
    const outerR = r;
    const innerR = r - GAP; // 고정된 GAP 적용

    // 꼭짓점 계산
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

    // 외곽 다각형
    ctx.beginPath();
    outerPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.stroke();

    // 내곽 다각형
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

    // 틀 도형(array / dict / xarray) 확정 시 레지스트리에 등록
    if (["array", "dict", "xarray"].includes(state.tool) && e) {
        const finalX = e.offsetX ?? e.clientX;
        const finalY = e.offsetY ?? e.clientY;
        const outerR = Math.hypot(finalX - state.startX, finalY - state.startY);
        if (outerR > GAP + 10) {
            drawnShapes.push({
                tool:   state.tool,
                cx:     state.startX,
                cy:     state.startY,
                outerR: outerR,
                innerR: outerR - GAP,   // app.js 전체에서 GAP(50px) 고정 적용
            });
            console.log(`🖊️ [틀 등록] ${state.tool} at (${state.startX.toFixed(0)}, ${state.startY.toFixed(0)}) r=${outerR.toFixed(0)}`);
        }
    }

    // ai 해석부 추가
    // 브러시 도구로 그림을 그리다가 손을 떼었을 때 작동 시작
    if (state.tool === "brush") {
        clearTimeout(aiTimeout);
        aiTimeout = setTimeout(async () => {
            console.log("🔮 AI가 마법진 기호를 실시간으로 분석하고 있습니다...");
            
            // 현재 활성화된 화면의 canvas 요소를 AI 모듈에 통째로 투입
            const detections = await mysticalAI.detect(canvas); 
            
            console.log("🎯 [분석 성공] 탐지된 기호 리스트:", detections);
            
            // 후속 처리 예시:
            detections.forEach((res) => {
                console.log(`발견된 기호명: ${res.className}, 신뢰도: ${(res.score * 100).toFixed(1)}%, 좌표: (${res.cx.toFixed(0)}, ${res.cy.toFixed(0)})`);
            });

            // ── STEP 1: sigil을 소속 틀 도형에 분류 ────────────────────────────
            // detection의 중심(cx, cy)이 틀의 innerR 원 안에 있으면 그 틀 소속.
            // 여러 틀에 중복 포함될 경우 가장 가까운(작은) innerR 우선 배정.
            const sigilsByShape = assignSigilsToShapes(detections, drawnShapes);

            // ── STEP 2: 각 틀 내부 sigil을 반시계 방향 각도로 정렬 ─────────────
            // 캔버스 좌표계는 Y축이 아래로 증가하므로
            // atan2(-(dy), dx) 로 Y축 반전 후 반시계 각도를 얻습니다.
            for (const entry of sigilsByShape) {
                entry.sigils = sortCounterClockwise(entry.sigils, entry.shape);
            }

            // ── STEP 3: PostScript 코드 문자열 조립 ────────────────────────────
            const psCode = assemblePSCode(sigilsByShape);

            console.log("📜 [PostScript 해석 결과]\n" + psCode);

            // 결과를 화면에 출력
            const outputEl = document.getElementById("ps-output");
            if (outputEl) outputEl.textContent = psCode || "(탐지된 기호 없음)";

            // Lambda 렌더링 요청 (psCode가 있을 때만)
            if (psCode) {
                renderWithLambda(psCode);
            }

        }, 1000); // 1초 동안 추가적인 드로잉이 없으면 마법진 해석 시작
    }
}

canvas.addEventListener("mousedown",  onMouseDown);
canvas.addEventListener("mousemove",  onMouseMove);
canvas.addEventListener("mouseup",    onMouseUp);
// mouseleave는 틀 등록 없이 페인팅 상태만 해제
// (캔버스 밖 좌표로 outerR이 오염되는 것을 방지)
canvas.addEventListener("mouseleave", () => { state.painting = false; });

// ── 컨트롤 이벤트 ────────────────────────────────────────────────────────────

rangeInput?.addEventListener("input", (e) => { ctx.lineWidth   = e.target.value; });
colorInput?.addEventListener("input", (e) => { ctx.strokeStyle = e.target.value; });

clearBtn?.addEventListener("click", () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawnShapes.length = 0;   // 틀 레지스트리 초기화
    initCtx();
});

saveBtn?.addEventListener("click", () => {
    const link = document.createElement("a");
    link.href     = canvas.toDataURL("image/png");
    link.download = "painting.png";
    link.click();
});

// ── Lambda 렌더링 연동 ────────────────────────────────────────────────────────

/**
 * PostScript 코드를 Lambda에 전송하고 렌더링 결과 이미지를 표시합니다.
 *
 * 환경변수(빌드 치환) 또는 window.LAMBDA_URL 전역으로 엔드포인트를 설정합니다.
 * 로컬 개발 시: window.LAMBDA_URL = "http://localhost:3000/render"; (console에서 직접 설정)
 * AWS 배포 시: index.html의 <script>에서 window.LAMBDA_URL = "https://<api-id>.execute-api.<region>.amazonaws.com/render";
 *
 * @param {string} psCode  - assemblePSCode() 반환 PostScript 문자열
 */
async function renderWithLambda(psCode) {
    const endpoint = window.LAMBDA_URL ?? null;

    // 엔드포인트 미설정 시 로컬 미리보기로 fallback
    if (!endpoint) {
        console.info("ℹ️ LAMBDA_URL 미설정 — 로컬 모드(PS 코드 출력만 수행)");
        setRenderStatus("idle", "LAMBDA_URL을 설정하면 렌더링 결과를 볼 수 있습니다.");
        return;
    }

    const modeEl = document.getElementById("render-mode");
    const mode   = modeEl ? modeEl.value : "magic";   // "normal" | "magic"

    setRenderStatus("loading", "렌더링 중…");

    try {
        const res = await fetch(endpoint, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ code: psCode, mode }),
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        }

        const { url } = await res.json();   // Lambda는 { url: "<presigned S3 URL>" } 반환
        showRenderResult(url);
        setRenderStatus("done", "렌더링 완료");
    } catch (err) {
        console.error("🔴 [Lambda 렌더링 오류]", err);
        setRenderStatus("error", `오류: ${err.message}`);
    }
}

/** 렌더링 상태 텍스트 업데이트 */
function setRenderStatus(state, message) {
    const el = document.getElementById("render-status");
    if (!el) return;
    el.textContent = message;
    el.dataset.state = state;   // CSS로 색상 분기 가능
}

/** Presigned URL로부터 결과 이미지를 패널에 표시 */
function showRenderResult(url) {
    const img = document.getElementById("render-img");
    if (!img) return;
    img.src   = url;
    img.style.display = "block";
}

// ── STEP 1 보조: 틀 도형 평탄 리스트 → 부모-자식 트리 변환 ──────────────────
/**
 * 큰 틀(outerR 기준) 안에 작은 틀의 중심이 들어 있으면 자식으로 귀속시킵니다.
 * 최소 포함 틀(innerR이 가장 작은 것)이 직접 부모가 됩니다.
 *
 * @param {Array} shapes - drawnShapes 레지스트리 (평탄 배열)
 * @returns {Array} 루트 틀들의 배열 (각각 .children 배열 보유)
 */
function buildShapeTree(shapes) {
    // 각 shape에 children 배열 초기화
    const nodes = shapes.map((s) => ({ ...s, children: [] }));

    // outerR 내림차순 정렬(큰 틀부터 처리)하여 포함 관계 판정
    nodes.sort((a, b) => b.outerR - a.outerR);

    const roots = [];

    for (const node of nodes) {
        // 이미 배치된 nodes 중 자신의 중심을 포함하는 가장 작은 innerR 틀을 부모로 선택
        let bestParent = null;
        let bestInnerR = Infinity;

        for (const candidate of nodes) {
            if (candidate === node) continue;
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
 /*
 * 각 detection을 소속 틀 도형에 배정합니다.
 *
 * 규칙:
 *   - sigil의 중심(cx, cy)이 틀의 innerR 원 안에 있을 때 소속으로 판정.
 *     (sigil은 innerR 링 안쪽에 그려지므로 outerR이 아닌 innerR 기준 사용)
 *   - 두 틀에 동시에 포함될 경우 거리가 더 가까운(중심까지 거리가 짧은) 틀 우선.
 *   - 어떤 틀에도 속하지 않는 sigil은 "orphan" 버킷에 모읍니다.
 *
 * @param {Array} detections  - ai.js detect() 반환값
 * @param {Array} shapes      - drawnShapes 레지스트리
 * @returns {Array}  [{ shape, sigils[] }, ..., { shape: null, sigils[] }]
 */
function assignSigilsToShapes(detections, shapes) {
    // ── 좌표계 역변환 ────────────────────────────────────────────────────────
    // ai.js preprocess()는 캔버스를 imgSize(704px) 정방형으로 리사이즈한 뒤 추론하므로
    // ONNX 출력 cx/cy는 704px 공간 기준입니다.
    // drawnShapes의 좌표는 700px 캔버스 기준이므로 스케일을 맞춰야 합니다.
    const CANVAS_TO_MODEL = mysticalAI.imgSize / CANVAS_SIZE; // 704 / 700
    const MODEL_TO_CANVAS = 1 / CANVAS_TO_MODEL;

    // detection 좌표를 캔버스 픽셀 공간으로 역변환한 복사본 생성
    const mappedDetections = detections.map((det) => ({
        ...det,
        cx: det.cx * MODEL_TO_CANVAS,
        cy: det.cy * MODEL_TO_CANVAS,
        x:  det.x  * MODEL_TO_CANVAS,
        y:  det.y  * MODEL_TO_CANVAS,
        w:  det.w  * MODEL_TO_CANVAS,
        h:  det.h  * MODEL_TO_CANVAS,
    }));

    // 결과 구조 초기화
    const buckets = shapes.map((shape) => ({ shape, sigils: [] }));
    const orphans = { shape: null, sigils: [] };

    for (const det of mappedDetections) {
        let bestBucket = null;
        let bestDist   = Infinity;

        for (const bucket of buckets) {
            const { cx, cy, innerR } = bucket.shape;
            const dist = Math.hypot(det.cx - cx, det.cy - cy);

            // sigil bbox 반폭만큼 margin을 추가하여 경계 근처 sigil도 포함
            // (ONNX 좌표계 → 캔버스 좌표계 역변환 오차 흡수)
            const margin = Math.max(det.w, det.h) * MODEL_TO_CANVAS / 2;
            if (dist <= innerR + margin && dist < bestDist) {
                bestDist   = dist;
                bestBucket = bucket;
            }
        }

        if (bestBucket) {
            bestBucket.sigils.push(det);
        } else {
            orphans.sigils.push(det);
        }
    }

    // 고아 sigil이 있는 경우에만 orphan 버킷 포함
    const result = buckets.filter((b) => b.sigils.length > 0);
    if (orphans.sigils.length > 0) {
        console.warn(`⚠️ [orphan sigil] 틀에 미배정된 기호 ${orphans.sigils.length}개:`,
            orphans.sigils.map((s) => s.className));
        result.push(orphans);
    }

    return result;
}

/**
 * STEP 2 — sortCounterClockwise
 *
 * 틀의 중심점을 기준으로 sigil들을 반시계 방향(CCW) 각도순으로 정렬합니다.
 *
 * 캔버스 좌표계 보정:
 *   - 브라우저 Canvas는 Y축이 아래로 증가(화면 좌상단 = 0,0)하므로
 *     표준 수학 좌표계와 Y 부호가 반전됩니다.
 *   - atan2(-(sigil.cy - center.cy), sigil.cx - center.cx) 로 Y를 뒤집어
 *     반시계 방향 각도를 올바르게 산출합니다.
 *   - 3시(오른쪽) = 0rad 를 기준으로 반시계 증가, 결과는 내림차순 정렬.
 *
 * @param {Array}  sigils  - 정렬할 detection 배열
 * @param {Object} shape   - 틀 도형 { cx, cy, ... }
 * @returns {Array} 반시계 각도 내림차순 정렬된 sigil 배열
 */
function sortCounterClockwise(sigils, shape) {
    if (!shape) return sigils; // orphan은 정렬 생략

    const { cx: originX, cy: originY } = shape;

    return [...sigils].sort((a, b) => {
        // Y축 반전 후 0~2π 범위로 정규화 (±π 경계에서 순서 역전 방지)
        // 3시(오른쪽, 0rad) 기준 반시계(CCW) 증가 → 내림차순 정렬
        const TWO_PI = 2 * Math.PI;
        const rawA = Math.atan2(-(a.cy - originY), a.cx - originX);
        const rawB = Math.atan2(-(b.cy - originY), b.cx - originX);
        const angleA = ((rawA % TWO_PI) + TWO_PI) % TWO_PI;
        const angleB = ((rawB % TWO_PI) + TWO_PI) % TWO_PI;

        // 내림차순 → 3시 기준 반시계(위→왼→아래→오른쪽) 순서
        return angleB - angleA;
    });
}

/**
 * STEP 3 — assemblePSCode
 *
 * 분류·정렬된 sigil 목록을 PostScript 코드 문자열로 조립합니다.
 *
 * 변환 규칙:
 *   className           → PS 토큰
 *   ─────────────────────────────────────────
 *   sigil_array         → [  (배열 시작, 자식 재귀 처리)
 *   sigil_dict          → << (딕셔너리 시작, 자식 재귀 처리)
 *   sigil_RETURN        → (개행 삽입용 구분자, 실제 PS엔 미출력)
 *   sigil_COMPLETE      → (현재 틀 닫기 마커)
 *   sigil_<op>          → <op>  (그 외는 접두어 제거 후 그대로 출력)
 *
 * 중첩 구조:
 *   드래프트 구현에서는 단일 레벨 조립을 수행합니다.
 *   틀 안에 탐지된 sigil_array / sigil_dict가 있으면 내부를 재귀 조립합니다.
 *   (현재 drawnShapes는 평탄 리스트이므로 중첩 틀은 부모-자식 관계를 거리로 추정)
 *
 * @param {Array} sigilsByShape - assignSigilsToShapes() 반환값
 * @returns {string} PostScript 코드 문자열
 */
function assemblePSCode(sigilsByShape) {
    // className → PS 토큰 변환 (sigil_ 접두어 제거)
    function toToken(className) {
        return className.replace(/^sigil_/, "");
    }

    // 단일 틀을 재귀적으로 조립
    // innerEntries: 이 틀 안에 속한 자식 틀 entry 목록
    function assembleOne(entry, innerEntries = []) {
        const { shape, sigils } = entry;

        if (!shape) {
            // orphan: 틀 없이 sigil 나열
            return sigils.map((s) => toToken(s.className)).join(" ");
        }

        const tool   = shape.tool;
        const tokens = [];

        for (const s of sigils) {
            const tok = toToken(s.className);

            // sigil 위치에 자식 틀이 연결돼 있으면 자식 틀 코드로 대체
            // (자식 틀의 중심이 이 sigil의 bbox 안에 있으면 연결됐다고 판단)
            const linkedChild = innerEntries.find((child) => {
                if (!child.shape) return false;
                const dx = child.shape.cx - s.cx;
                const dy = child.shape.cy - s.cy;
                return Math.hypot(dx, dy) < Math.max(s.w, s.h);
            });

            if (linkedChild) {
                // 자식 틀 코드를 재귀 조립하여 이 위치에 삽입
                tokens.push(assembleOne(linkedChild, []));
            } else {
                tokens.push(tok);
            }
        }

        // 자식 틀 중 sigil에 연결되지 않은 것은 독립 추가
        for (const child of innerEntries) {
            const alreadyLinked = tokens.some((t) => {
                // 재귀 조립된 문자열이 이미 들어있는지 확인
                const childCode = assembleOne(child, []);
                return t === childCode;
            });
            if (!alreadyLinked) {
                tokens.push(assembleOne(child, []));
            }
        }

        if (tool === "xarray") {
            return `{ ${tokens.join(" ")} }`;
        } else if (tool === "array") {
            return `[ ${tokens.join(" ")} ]`;
        } else if (tool === "dict") {
            // dict 내부: 반시계 정렬 후 순서 = /key value /key value …
            // 홀수 인덱스 토큰은 /key 형태(이름), 짝수는 value
            const pairs = [];
            for (let i = 0; i + 1 < tokens.length; i += 2) {
                const key = tokens[i];
                const val = tokens[i + 1];
                // key가 이미 / 로 시작하면 그대로, 아니면 /key 형태로 감쌈
                const psKey = key.startsWith("/") ? key : `/${key}`;
                pairs.push(`    ${psKey} ${val}`);
            }
            // 토큰 수가 홀수이면 마지막 항목 단독 추가
            if (tokens.length % 2 !== 0) {
                pairs.push(`    ${tokens[tokens.length - 1]}`);
            }
            return `<<\n${pairs.join("\n")}\n>>`;
        }

        return tokens.join(" ");
    }

    // drawnShapes를 부모-자식 트리로 변환
    const shapeTree = buildShapeTree(
        sigilsByShape.filter((e) => e.shape).map((e) => e.shape)
    );

    // 트리 루트에 해당하는 entry만 최상위로 조립
    const orphanEntry = sigilsByShape.find((e) => !e.shape);
    const parts = [];

    for (const rootShape of shapeTree) {
        const entry       = sigilsByShape.find((e) => e.shape === rootShape) ?? { shape: rootShape, sigils: [] };
        const childShapes = rootShape.children ?? [];
        const childEntries = childShapes.map(
            (cs) => sigilsByShape.find((e) => e.shape === cs) ?? { shape: cs, sigils: [] }
        );
        parts.push(assembleOne(entry, childEntries));
    }

    if (orphanEntry && orphanEntry.sigils.length > 0) {
        parts.push(assembleOne(orphanEntry, []));
    }

    if (parts.length === 0) return "";
    if (parts.length === 1) return parts[0];
    // 최상위 틀이 여러 개면 순서대로 줄바꿈 나열
    return parts.join("\n");
}