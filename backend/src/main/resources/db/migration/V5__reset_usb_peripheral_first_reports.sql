-- Agent 0.2.15: 0.2.14가 복합 장치의 기능(삼성 모뎀·MTP·ADB 등)을 별도 행으로 저장하고, 주변기기에 자리표시자 시리얼(16843009)과
-- 일반 명칭을 저장했다. 0.2.15 보고와 키가 달라 가짜 "연결/분리" 이력이 생기지 않도록 초기화하고 다음 보고를 최초 수집으로 처리한다.
-- (USB 과거 기록은 PC에 남아 있어 다음 보고에서 다시 채워진다. 적용 시점 운영 데이터: DESKTOP-KJH 1대, 0.2.14 보고분)
DELETE FROM asset_usb_device;
DELETE FROM asset_peripheral;
UPDATE asset SET usb_collected_at = NULL, peripherals_collected_at = NULL
 WHERE usb_collected_at IS NOT NULL OR peripherals_collected_at IS NOT NULL;
