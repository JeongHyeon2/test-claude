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
