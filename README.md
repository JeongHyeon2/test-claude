# test-claude

Hello World 웹페이지입니다.

## 로컬에서 보기

`index.html` 파일을 브라우저로 열면 됩니다.

## 배포

`.github/workflows/deploy-pages.yml` 워크플로가 이 브랜치에 푸시될 때마다
`index.html`을 GitHub Pages에 배포합니다.

**최초 1회 수동 설정이 필요합니다.** (Pages 사이트 생성은 워크플로 토큰 권한 밖입니다)

1. 저장소 **Settings** → **Pages** 이동
2. **Source**를 `GitHub Actions`로 선택
3. **Actions** 탭에서 `Deploy to GitHub Pages`를 `Run workflow`로 실행
   (또는 아무 커밋이나 푸시)

배포 주소: https://jeonghyeon2.github.io/test-claude/
