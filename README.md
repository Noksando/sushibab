# 스시밥 재고 관리 앱 (MVP)

직원들이 동시에 접속해서 재고와 미결제 영수증을 실시간으로 확인/수정하는 초간단 앱입니다.

## 기능

- 매장별 재고 목록 확인 (`1호점`, `2호점`, `부엌`)
- 각 재고 항목 `+/-` 버튼으로 수량 변경
- 변경 시 모든 접속자 화면에 실시간 반영
- 미결제 영수증(Opened Bill) 등록
  - 회사명
  - 수령일
  - 금액
- 영수증 `결제완료` 처리(리스트에서 제거)

## 실행

```bash
npm install
npm start
```

브라우저에서 `http://localhost:3000` 접속.

## 데이터 저장

- 데이터 파일: `data/store.json`
- 서버가 변경 내용을 파일에 즉시 저장합니다.

## 파일 구조

- `server.js`: Express + Socket.IO 서버
- `public/index.html`: 화면
- `public/main.js`: 실시간 이벤트/렌더링 로직
- `public/styles.css`: 기본 스타일
- `data/store.json`: 현재 재고/영수증 데이터
