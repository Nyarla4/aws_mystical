# aws_mystical

YOLOv8 Nano 기반의 ONNX 모델을 활용하여 브라우저 환경에서 실시간으로 마법진 기호를 탐지하고, 분석된 기호 시퀀스를 PostScript 코드로 매핑하여 AWS Lambda 백엔드에서 해석 및 실행하는 융합 아키텍처 프로젝트입니다.

## 주요 기능
- 실시간 기호 탐지: 웹 브라우저 Canvas2D 환경에서 ONNX Runtime 기술을 이용하여 사용자 드로잉 실시간 추론
- 인덱싱 및 NMS 후처리: 모델이 출력하는 바운딩 박스와 클래스 신뢰도 점수를 분석하고, IoU(Intersection over Union) 연산 기반의 비최대 억제(Non-Maximum Suppression) 알고리즘을 거쳐 정확한 기호 좌표 추출
- PostScript 백엔드 연동: 추출된 기호 체계를 PostScript(PS) 스트림 구조로 해석하여 AWS 서버리스 아키텍처 내에서 컴파일 및 결과 반환

## 프로젝트 구조
```
aws_mystical/
├── mystical_deploy_kit/     # AWS 배포 자산 킷
│   └── iam/
│   │   └── policy 및 cors 등 json
│   └── lambda/
│   │   └── ps_lib/
│   │   │   └── dmmlib/      # 리눅스 환경 호환 구조의 PostScript 코어 라이브러리 엔티티
│   │   └── handler.py
│   └── new/
│   │   └── paint/
│   │       └── app.js       # 웹 화면 Canvas 렌더링, 이벤트 핸들링 및 디버그 콘솔 제어
│   │       └── ai.js        # ONNX 모델 로드, 전처리 데이터 생성 및 NMS 알고리즘 구현
│   │       └── best.onnx
│   │       └── index.html
│   │       └── reset.css
│   │       └── styles.css
│   └── deploy.sh
│   └── ghostscript-arm64.zip
│   └── lambda_package.zip
└── .gitignore               # 형상 관리 제외 대상 정의 파일
```
## 개발 환경 구성 및 저장소 관리 규칙

### 1. 파일 시스템 호환성 주의사항 (dmmlib)
`mystical_deploy_kit/lambda/ps_lib/dmmlib/` 디렉토리 내부는 AWS Lambda(Linux) 환경 구동에 맞추어 구성되어 있으므로, 리눅스 전용 파일 속성 및 특수 링크를 포함하고 있습니다. Windows 네이티브 환경(PowerShell 등)에서 해당 경로의 인덱싱을 시도할 경우 파일 시스템 레이어 경계 불일치로 인한 오류(Function not implemented)가 발생합니다.

따라서 파일의 무결성과 형상 관리를 유지하기 위해, 소스 코드 수정 후 원격 저장소 푸시 작업은 반드시 **WSL(Linux) 터미널** 환경에서 수행해야 합니다.


-----------------------------
aws
    CloudWatch > 로그 관리 > 로그 그룹: 람다가 잔존하며 추가적인 지속적 비용 청구가 될 수 있음
    API Gateway > 리소스