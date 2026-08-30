# 블랙박스 영상 자차 속도 추정 — MVP

블랙박스 영상 하나를 올리면 시간축 속도·감속 구간·오차 범위를 추정해
화면과 PDF 리포트로 내주는 서비스. 2주 MVP 범위만 구현했습니다.

```bash
npm install
npm start          # http://localhost:3000
npm test
```

## 흐름

```
랜딩 → 업로드(영상·이메일·용도·동의) → 서버 재검증 ─실패→ 실패 화면 + 기종 수집
                                          └통과→ 저장 + SHA-256 → 큐
                                                 └→ 워커: 모델 실행 ─실패→ 사유 안내 메일
                                                        └성공→ 결과 + 결과 링크 메일
                                                               └→ 결과 화면 → PDF ★
스토리지 ┈(보관기간 경과)┈→ 영상 자동 삭제 (결과·해시는 남김)
```

업로드와 처리는 분리돼 있습니다. 업로드 응답은 즉시 돌아오고 분석은 워커가 따로 돕니다.

## 구성

| 경로 | 역할 |
| --- | --- |
| `src/config.js` | **미확정 값이 모여 있는 곳.** `TODO: 결정 필요` 주석이 달린 항목은 임의로 확정하지 않았습니다 |
| `src/failures.js` | 실패 사유 카탈로그. 화면·메일·이벤트 라벨이 전부 여기서 나옵니다 |
| `src/model/` | 속도 추정 모델 어댑터 (`stub` / `command`) |
| `src/analysis.js` | 모델 출력 → 감속 구간 탐지·구간 요약·근거 프레임 시각 |
| `src/report/chart.js` | 화면 SVG와 PDF가 공유하는 그래프 좌표 계산 |
| `src/report/pdf.js` | PDF 리포트 (그래프·구간별 속도·오차 범위·근거 프레임·고지·해시) |
| `src/worker.js` | 큐 소비. 재시도·중단 복구·메일 발송 |
| `src/db.js` | SQLite 한 파일. 관리자 화면 대신 직접 조회합니다 |
| `screen_spec.md` | 흐름도 기준으로 추린 화면 5개 명세 |

## 실제 모델 연결

기본값은 스텁이라 **영상 내용을 분석하지 않습니다** (화면·PDF·메일이 전부 그렇게 표시합니다).
실제 모델은 외부 명령으로 붙입니다. 마지막 인자로 영상 경로를 받고 stdout으로 JSON을 내면 됩니다.

```bash
MODEL_ADAPTER=command MODEL_COMMAND="python /opt/model/estimate.py" npm start
```

```json
{ "modelVersion": "v1.2", "samples": [{ "t": 0.0, "v": 12.4, "lo": 10.4, "hi": 14.4 }] }
```

`lo`/`hi`를 주지 않으면 `FALLBACK_BAND_MS` 폭으로 채웁니다.
추정 불가 상황은 stderr 첫 토큰에 사유 코드(`INSUFFICIENT_MOTION` 등)를 적고 0이 아닌 코드로 종료하면
해당 사유가 화면과 메일에 그대로 나갑니다.

## 환경변수

| 변수 | 기본값 | 비고 |
| --- | --- | --- |
| `BASE_URL` | `http://localhost:3000` | 메일 링크에 쓰므로 배포 시 필수 |
| `MODEL_ADAPTER` / `MODEL_COMMAND` | `stub` / — | 실제 모델 연결 |
| `SMTP_URL` | — | 없으면 `var/mail/*.eml`로 떨굽니다 |
| `RETENTION_HOURS` | `72` | **결정 필요.** UI 문구가 이 값을 인용합니다 |
| `SAMPLE_REPORT_TOKEN` | — | 랜딩 샘플. 실제 분석 1건의 토큰을 넣습니다 (더미 금지) |
| `FFMPEG_PATH` | `ffmpeg` | 없으면 근거 프레임을 자리표시자로 표기합니다 |
| `WORKER_CONCURRENCY` | `1` | **결정 필요** |

전체 목록과 미확정 사유는 `src/config.js`에 주석으로 적어 뒀습니다.

## 알아 둘 것

- **스텁 기본값** — 실제 모델을 붙이기 전 결과는 어떤 판단에도 쓸 수 없습니다.
- **근거 프레임** — `ffmpeg`이 없으면 이미지를 만들어 내지 않고 "프레임 없음"으로 표기합니다.
- **오차 범위와 고지 문구** — 화면과 PDF 양쪽에서 제거하지 않습니다. 법적 리스크 차단 장치입니다.
- **PDF 한글 글꼴** — `assets/fonts/`의 Pretendard(OFL, 라이선스 동봉)를 내장합니다.

---

# 움직이는 표본

CSS·SVG 필터·Canvas로 만든 열 가지 움직임을, 원리와 함께 표본처럼 늘어놓은 수집장.
**열 개 전부 만질 수 있습니다** — 끌고, 문지르고, 눌러 보세요.

**https://jeonghyeon2.github.io/test-claude/**

| 표본 | 기법 | 조작 |
| --- | --- | --- |
| 01 진자 파동 | CSS | 가로로 문지르면 시간이 감김 |
| 02 메타볼 | SVG 필터 | 커서가 여섯 번째 방울이 됨 |
| 03 모아레 | CSS | 커서로 각도·배율 조율 |
| 04 무리 짓기 | Canvas | 커서를 따라옴 · 누르면 흩어짐 |
| 05 물결 격자 | CSS | 파문의 진원이 커서로 이동 |
| 06 흐름장 | Canvas | 커서 주위 소용돌이 · 클릭 → 궤적 지우기 |
| 07 로렌츠 끌개 | Canvas | 끌어서 시점 회전 |
| 08 정육면체 | CSS | 끌어서 직접 굴리기 |
| 09 생명 게임 | Canvas | 끌어서 세포 그리기 · 더블클릭 → 새로 파종 |
| 10 트뤼셰 타일 | Canvas | 지나가면 타일 뒤집힘 · 클릭 → 새로 깔기 |

조작은 포인터 이벤트로 배선해 마우스와 터치에서 모두 동작하고,
모션을 끈 상태에서도 살아 있습니다 (정지 중에는 조작할 때마다 한 프레임씩 다시 그림).

---

# 활자 견본실

한글과 라틴을 나란히 놓고 크기·자간·행간·굵기를 직접 움직여 보는 활자 견본지.

**https://jeonghyeon2.github.io/test-claude/**

## 구성

- `index.html` — 움직이는 표본 (첫 장)
- `specimen.html` — 활자 견본실
- 둘 다 프레임워크·빌드 단계 없음
- `.github/workflows/deploy-pages.yml` — 푸시하면 GitHub Pages로 배포

## 설계 메모

| 항목 | 값 |
| --- | --- |
| 디스플레이 | Bodoni Moda (라틴 전용) |
| 한글 | Pretendard Variable |
| 데이터·사양 표기 | IBM Plex Mono |
| 바탕 | Porcelain `#eef0f3` / 다크 `#0e1014` |
| 강조 | Ultramarine `#2b3ce8`, Coral `#ff7a6b` |
| 그리드 | 여백 사양표 13rem + 본문 1fr |

- 라이트/다크는 토큰만 재정의합니다. `prefers-color-scheme`과 `[data-theme]` 양쪽에 대응합니다.
- 히어로 뒤 하프톤 망점은 Canvas로 그리고 커서에 반응합니다.
- `prefers-reduced-motion: reduce`에서는 등장 연출과 망점 애니메이션이 모두 멈춥니다.
- 한글이 어절 중간에서 끊기지 않도록 `word-break: keep-all`을 적용했습니다.

## 로컬에서 보기

`index.html`을 브라우저로 열면 됩니다.
