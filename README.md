# 활자 견본실

한글과 라틴을 나란히 놓고 크기·자간·행간·굵기를 직접 움직여 보는 활자 견본지.

**https://jeonghyeon2.github.io/test-claude/**

## 구성

- `index.html` — 페이지 전체. 프레임워크·빌드 단계 없음
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
