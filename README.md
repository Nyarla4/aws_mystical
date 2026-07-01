# aws_mystical

- YOLOv8 기반의 ONNX<sup>[1](#footnote_1)</sup> 모델 활용
- 브라우저 환경에서 실시간으로 Mystical 언어<sup>[2](#footnote_2)</sup> 탐지
- 분석된 기호 시퀀스를 PostScript 코드<sup>[3](#footnote_3)</sup>로 매핑
- AWS Lambda<sup>[4](#footnote_4)</sup> 백엔드에서 해석 및 실행

## 주요 기능
- 실시간 기호 탐지: 웹 브라우저 Canvas2D 환경에서 ONNX Runtime<sup>[5](#footnote_5)</sup> 기술을 이용하여 사용자 드로잉 실시간 추론
- PostScript 백엔드 연동: 추출된 기호 체계를 PostScript(PS) 스트림 구조로 해석하여 AWS 서버리스 아키텍처 내에서 컴파일 및 결과 반환

<!-- aws
    CloudWatch > 로그 관리 > 로그 그룹: 람다가 잔존하며 추가적인 지속적 비용 청구가 될 수 있음
    API Gateway > 리소스 -->

<a name="footnote_1">1</a>: Open Neural Network Exchange. 다른 DNN 프레임워크 환경(ex Tensorflow, PyTorch, etc..)에서 만들어진 모델들을 서로 호환되게 사용할 수 있도록 만들어진 공유 플랫폼

<a name="footnote_2">2</a>: PostScript를 원형 띠, 기호, 일부 텍스트로 표현한 작성 방식

<a name="footnote_3">3</a>: PDL(페이지 기술 언어), 디지털 문서를 고품질 벡터 그래픽과 텍스트로 변환하여 출력하는 스택 기반의 프로그래밍 언어.

<a name="footnote_4">4</a>: 아마존 웹 서비스(AWS)가 제공하는 이벤트 기반의 서버리스 컴퓨팅 서비스로, 인프라(서버) 관리 없이 코드만 업로드하여 필요할 때마다 실행하는 함수 단위의 연산 플랫폼.

<a name="footnote_5">5</a>: 크로스 플랫폼 추론 및 학습 머신러닝 가속기