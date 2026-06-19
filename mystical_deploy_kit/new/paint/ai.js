/**
 * Mystical Language AI Detector Module (YOLOv8 Pose Multi-Task 단일 가중치 규격)
 * 파일명: ai.js
 */

const MYSTICAL_CLASSES = [
    "sigil_RETURN", "sigil_COMPLETE", "sigil_pop", "sigil_exch", "sigil_dup", "sigil_copy",
    "sigil_index", "sigil_roll", "sigil_add", "sigil_div", "sigil_idiv", "sigil_mod",
    "sigil_mul", "sigil_sub", "sigil_abs", "sigil_neg", "sigil_sqrt", "sigil_atan",
    "sigil_cos", "sigil_sin", "sigil_rand", "sigil_srand", "sigil_rrand", "sigil_array",
    "sigil_length", "sigil_get", "sigil_put", "sigil_getinterval", "sigil_putinterval", "sigil_forall",
    "sigil_dict", "sigil_begin", "sigil_end", "sigil_def", "sigil_string", "sigil_eq",
    "sigil_ne", "sigil_ge", "sigil_gt", "sigil_le", "sigil_lt", "sigil_and",
    "sigil_not", "sigil_or", "sigil_xor", "sigil_true", "sigil_false", "sigil_exec",
    "sigil_if", "sigil_ifelse", "sigil_for", "sigil_repeat", "sigil_loop", "sigil_exit",
    "sigil_type", "sigil_cvlit", "sigil_cvx", "sigil_xcheck", "sigil_cvi", "sigil_cvn",
    "sigil_cvr", "sigil_cvrs", "sigil_cvs", "sigil_file", "sigil_run", "sigil_gsave",
    "sigil_grestore", "sigil_setlinewidth", "sigil_currentlinewidth", "sigil_setlinecap", "sigil_currentlinecap", "sigil_setlinejoin",
    "sigil_currentlinejoin", "sigil_setmiterlimit", "sigil_currentmiterlimit", "sigil_setdash", "sigil_currentdash", "sigil_setcolor",
    "sigil_currentcolor", "sigil_setgray", "sigil_currentgray", "sigil_sethsbcolor", "sigil_currenthsbcolor", "sigil_setrgbcolor",
    "sigil_currentrgbcolor", "sigil_setcmykcolor", "sigil_currentcmykcolor", "sigil_currentmatrix", "sigil_setmatrix", "sigil_translate",
    "sigil_scale", "sigil_rotate", "sigil_newpath", "sigil_currentpoint", "sigil_moveto", "sigil_rmoveto",
    "sigil_lineto", "sigil_rlineto", "sigil_arc", "sigil_arcn", "sigil_curveto", "sigil_rcurveto",
    "sigil_closepath", "sigil_clip", "sigil_stroke", "sigil_fill", "sigil_showpage", "sigil_findfont",
    "sigil_scalefont", "sigil_setfont", "sigil_currentfont", "sigil_selectfont", "sigil_show", "sigil_stringwidth",
    // 차기 고도화 규격 신규 추가 클래스 6종 (총 120개 클래스)
    "text_number", "text_string",
    "ring_xarray", "ring_array", "ring_dict", "ring_start_marker"
];

export class MysticalAI {
    constructor(modelUrl) {
        this.modelUrl = modelUrl;
        this.session = null;
        this.imgSize = 704; // 704 고해상도 유지
    }

    async init() {
        try {
            this.session = await ort.InferenceSession.create(this.modelUrl);
            console.log("🟢 [MysticalAI] Multi-Task YOLO Pose Model Loaded.");
        } catch (error) {
            console.error("🔴 [MysticalAI] Model Load Failed:", error);
        }
    }

    preprocess(canvas) {
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = this.imgSize;
        tempCanvas.height = this.imgSize;
        const tempCtx = tempCanvas.getContext("2d");
        
        tempCtx.fillStyle = "#FFFFFF";
        tempCtx.fillRect(0, 0, this.imgSize, this.imgSize);
        tempCtx.drawImage(canvas, 0, 0, this.imgSize, this.imgSize);
        
        const imgData = tempCtx.getImageData(0, 0, this.imgSize, this.imgSize);
        const { data } = imgData;

        const floatData = new Float32Array(3 * this.imgSize * this.imgSize);
        const rOffset = 0;
        const gOffset = this.imgSize * this.imgSize;
        const bOffset = this.imgSize * this.imgSize * 2;

        for (let i = 0; i < this.imgSize * this.imgSize; i++) {
            floatData[rOffset + i] = data[i * 4] / 255.0;     
            floatData[gOffset + i] = data[i * 4 + 1] / 255.0; 
            floatData[bOffset + i] = data[i * 4 + 2] / 255.0; 
        }

        return new ort.Tensor("float32", floatData, [1, 3, this.imgSize, this.imgSize]);
    }

    /**
     * 전면 개편된 단일 패스 예측 메서드
     * @returns {Promise<Array>} BBox, 정렬 중심점, 마커 좌표를 완전 결합한 객체 배열
     */
    async predict(canvas, scoreThreshold = 0.35, iouThreshold = 0.45) {
        if (!this.session) {
            console.error("❌ 모델 세션이 초기화되지 않았습니다.");
            return [];
        }

        const inputTensor = this.preprocess(canvas);
        const feeds = { [this.session.inputNames[0]]: inputTensor };

        const outputMap = await this.session.run(feeds);
        const outputTensor = outputMap[this.session.outputNames[0]];
        const outputData = outputTensor.data; 

        const numClasses = MYSTICAL_CLASSES.length; // 120
        const totalBoxes = outputTensor.dims[2];    // 앵커수 수집
        const candidates = [];

        // 고정 행 오프셋 정의
        const kpOffset = 4 + numClasses; // 4 + 120 = 124번 행부터 키포인트 시작

        for (let boxIdx = 0; boxIdx < totalBoxes; boxIdx++) {
            let maxScore = 0;
            let classId = -1;

            // 1. 120개 클래스에 대한 최대 스코어 탐색
            for (let c = 0; c < numClasses; c++) {
                const score = outputData[(4 + c) * totalBoxes + boxIdx];
                if (score > maxScore) {
                    maxScore = score;
                    classId = c;
                }
            }

            // 임계값 필터링
            if (maxScore >= scoreThreshold) {
                const cx = outputData[0 * totalBoxes + boxIdx];
                const cy = outputData[1 * totalBoxes + boxIdx];
                const w  = outputData[2 * totalBoxes + boxIdx];
                const h  = outputData[3 * totalBoxes + boxIdx];

                const x1 = cx - w / 2;
                const y1 = cy - h / 2;
                const className = MYSTICAL_CLASSES[classId];

                // 초기 기하 데이터 셋업
                let geometry = null;

                // 2. [결정론적 바인딩] 오직 링 구조체("ring_") 클래스일 때만 키포인트 파싱 진입
                if (className.startsWith("ring_") && className !== "ring_start_marker") {
                    // Keypoint 1: 구조체 중심점 (cx, cy)
                    const rcx = outputData[(kpOffset + 0) * totalBoxes + boxIdx];
                    const rcy = outputData[(kpOffset + 1) * totalBoxes + boxIdx];
                    const rcConf = outputData[(kpOffset + 2) * totalBoxes + boxIdx];

                    // Keypoint 2: 시작점 마커 위치 (sx, sy)
                    const smx = outputData[(kpOffset + 3) * totalBoxes + boxIdx];
                    const smy = outputData[(kpOffset + 4) * totalBoxes + boxIdx];
                    const smConf = outputData[(kpOffset + 5) * totalBoxes + boxIdx];

                    geometry = {
                        ringCenter: { x: rcx, y: rcy, confidence: rcConf },
                        startMarker: { x: smx, y: smy, confidence: smConf }
                    };
                }

                candidates.push({
                    x: x1, y: y1, w, h,
                    cx, cy, // BBox 가공 중심점
                    score: maxScore,
                    classId,
                    className,
                    geometry // 링 구조체 전용 컴포넌트 메타데이터 (일반 시질은 null)
                });
            }
        }

        // 3. 중복 영역 억제(NMS) 후 반환
        return this.nonMaximumSuppression(candidates, iouThreshold);
    }

    nonMaximumSuppression(boxes, iouThreshold) {
        boxes.sort((a, b) => b.score - a.score);
        const selected = [];
        const active = new Array(boxes.length).fill(true);

        for (let i = 0; i < boxes.length; i++) {
            if (!active[i]) continue;
            const boxA = boxes[i];
            selected.push(boxA);

            for (let j = i + 1; j < boxes.length; j++) {
                if (!active[j]) continue;
                const boxB = boxes[j];

                const x1 = Math.max(boxA.x, boxB.x);
                const y1 = Math.max(boxA.y, boxB.y);
                const x2 = Math.min(boxA.x + boxA.w, boxB.x + boxB.w);
                const y2 = Math.min(boxA.y + boxA.h, boxB.y + boxB.h);

                const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
                const areaA = boxA.w * boxA.h;
                const areaB = boxB.w * boxB.h;
                const union = areaA + areaB - intersection;
                const iou = intersection / union;

                if (iou >= iouThreshold) {
                    active[j] = false;
                }
            }
        }
        return selected;
    }
}