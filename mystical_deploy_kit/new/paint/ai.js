/**
 * Mystical Language AI Detector Module (YOLOv8 Nano 기반)
 * 파일명: ai.js
 */

// Colab 학습 환경 및 yaml 설정 정보와 100% 일치하는 클래스 리스트 배열
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
    "sigil_scalefont", "sigil_setfont", "sigil_currentfont", "sigil_selectfont", "sigil_show", "sigil_stringwidth"
]; // 총 114개 기호 완벽 매핑

export class MysticalAI {
    constructor(modelUrl) {
        this.modelUrl = modelUrl;
        this.session = null;
        this.imgSize = 704; // Colab config.imgsz 규격 동기화
    }

    // ONNX Runtime 세션 비동기 초기화
    async init() {
        try {
            // S3/CloudFront 혹은 상대 경로에서 best.onnx 로드
            this.session = await ort.InferenceSession.create(this.modelUrl);
            console.log("🟢 [MysticalAI] ONNX Model Loaded Successfully.");
        } catch (error) {
            console.error("🔴 [MysticalAI] Model Load Failed:", error);
        }
    }

    // 1단계: 프론트엔드 Canvas 요소를 640x640 크기의 정규화된 CHW Tensor로 변환
    preprocess(canvas) {
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = this.imgSize;
        tempCanvas.height = this.imgSize;
        const tempCtx = tempCanvas.getContext("2d");
        
        // 1. 배경을 흰색으로 먼저 채우기
        tempCtx.fillStyle = "#FFFFFF";
        tempCtx.fillRect(0, 0, this.imgSize, this.imgSize);

        // 원본 사용자 캔버스를 640x640 정방형으로 리사이즈하여 복사
        tempCtx.drawImage(canvas, 0, 0, this.imgSize, this.imgSize);
        const imgData = tempCtx.getImageData(0, 0, this.imgSize, this.imgSize);
        const { data } = imgData; // [R,G,B,A, R,G,B,A, ...] 형태의 평탄화 데이터

        // YOLOv8 입력 규격: [Batch=1, Channels=3, Height=704, Width=704]의 Float32 CHW 구조
        const floatData = new Float32Array(3 * this.imgSize * this.imgSize);
        const rOffset = 0;
        const gOffset = this.imgSize * this.imgSize;
        const bOffset = this.imgSize * this.imgSize * 2;

        for (let i = 0; i < this.imgSize * this.imgSize; i++) {
            floatData[rOffset + i] = data[i * 4] / 255.0;     // R 채널 정규화 (0~1)
            floatData[gOffset + i] = data[i * 4 + 1] / 255.0; // G 채널 정규화 (0~1)
            floatData[bOffset + i] = data[i * 4 + 2] / 255.0; // B 채널 정규화 (0~1)
        }

        return new ort.Tensor("float32", floatData, [1, 3, this.imgSize, this.imgSize]);
    }

    // 2단계: 이미지 추론 및 YOLOv8 행렬 데이터 변환 후처리 (NMS 포함)
    async detect(canvas, scoreThreshold = 0.35, iouThreshold = 0.45) {
        if (!this.session) {
            console.error("❌ 모델 세션이 초기화되지 않았습니다. init()을 먼저 호출하세요.");
            return [];
        }

        const inputTensor = this.preprocess(canvas);
        const feeds = {};
        feeds[this.session.inputNames[0]] = inputTensor;

        // ONNX 모델 예측 실행
        const outputMap = await this.session.run(feeds);
        const outputTensor = outputMap[this.session.outputNames[0]];
        const outputData = outputTensor.data; // Float32Array 형태로 변환된 텐서 출력값

        // YOLOv8 Nano 출력 형태: [1, 4(box) + 114(classes), 8400(anchors)] = 총 118행 8400열
        const numClasses = MYSTICAL_CLASSES.length; // 114
        const totalBoxes = outputTensor.dims[2];

        const candidates = [];

        // YOLOv8 출력 평탄화 행렬 스캔 (Transpose 형태에 대응)
        for (let boxIdx = 0; boxIdx < totalBoxes; boxIdx++) {
            let maxScore = 0;
            let classId = -1;

            // 4번 인덱스 행부터 117번 인덱스 행까지 반복하며 가장 높은 점수를 가진 클래스 식별
            for (let c = 0; c < numClasses; c++) {
                const score = outputData[(4 + c) * totalBoxes + boxIdx];
                if (score > maxScore) {
                    maxScore = score;
                    classId = c;
                }
            }

            // 확률 임계값을 넘은 후보 상자만 수집
            if (maxScore >= scoreThreshold) {
                // 바운딩 박스 중심좌표 및 크기 데이터 추출
                const cx = outputData[0 * totalBoxes + boxIdx];
                const cy = outputData[1 * totalBoxes + boxIdx];
                const w  = outputData[2 * totalBoxes + boxIdx];
                const h  = outputData[3 * totalBoxes + boxIdx];

                // 실제 캔버스 매핑을 위한 좌상단 픽셀 x, y 좌표 산출
                const x1 = cx - w / 2;
                const y1 = cy - h / 2;

                candidates.push({
                    x: x1, y: y1, w, h,
                    cx, cy, // 중심 좌표 데이터 (반시계 정렬 시 필수 파라미터)
                    score: maxScore,
                    classId: classId,
                    className: MYSTICAL_CLASSES[classId]
                });
            }
        }

        // 중복 예측 영역을 필터링(NMS)하고 신뢰도가 높은 최종 경계 상자 배열 반환
        return this.nonMaximumSuppression(candidates, iouThreshold);
    }

    // 3단계: 비최대 억제 알고리즘 (중복 박스 제거)
    nonMaximumSuppression(boxes, iouThreshold) {
        boxes.sort((a, b) => b.score - a.score); // 점수 내림차순 정렬
        const selected = [];
        const active = new Array(boxes.length).fill(true);

        for (let i = 0; i < boxes.length; i++) {
            if (!active[i]) continue;
            const boxA = boxes[i];
            selected.push(boxA);

            for (let j = i + 1; j < boxes.length; j++) {
                if (!active[j]) continue;
                const boxB = boxes[j];

                // IoU (Intersection over Union, 교집합/합집합 비율) 영역 계산
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
                    active[j] = false; // 중복도가 높은 박스는 후보에서 제외
                }
            }
        }
        return selected;
    }
}