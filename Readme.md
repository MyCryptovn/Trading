# DEX Bot Free / Paper Trading

Bot Node.js tập trung vào **Paper Trading, dữ liệu thực tế và kiểm soát rủi ro**.

## ⚠️ SAFETY

Đây là **PAPER TRADING ONLY**.

Bot hiện tại:

- Không có private key.
- Không kết nối ví để ký giao dịch.
- Không gửi transaction lên blockchain.
- Không giao dịch tiền thật.
- Không chuyển hoặc rút tiền.
- Không lưu seed phrase.
- Không có đường bật live execution tự động.

## Kiến trúc quyết định

Luồng mục tiêu:

```text
REAL-TIME MARKET DATA
        ↓
FAST DISCOVERY
        ↓
TOKEN SAFETY / LIQUIDITY / FRESHNESS
        ↓
CAPITAL FLOW + MOMENTUM + COST
        ↓
EMPIRICAL STATISTICAL EDGE
        ↓
WALK-FORWARD / OUT-OF-SAMPLE CHECK
        ↓
TRADE DECISION GATE
        ↓
PAPERTRADER
```

`TradeDecisionGate` là cơ quan duy nhất có quyền quyết định BUY / HOLD / EXIT.

### Không dùng ngưỡng giá cố định để BUY/SELL

Bot không dùng quy tắc kiểu “giảm X% thì BUY” hoặc “tăng Y% thì SELL” làm chiến lược giao dịch.

Thay vào đó, `StatisticalJournal` ghi các **forward outcomes đã quan sát thực tế**. `StatisticalEdgeEngine` dùng các mẫu này để đánh giá xác suất, khoảng tin cậy, expected value sau chi phí và kiểm tra walk-forward.

Khi chưa đủ dữ liệu hoặc bằng chứng không đủ mạnh, hệ thống phải **HOLD**.

## Statistical Journal

Journal có các nguyên tắc:

- Không tạo dữ liệu giả.
- Không ghi kết quả tương lai trước khi tương lai thực sự xảy ra.
- Không tạo sample mới nếu cùng context vẫn còn sample đang chờ.
- Dùng horizon rõ ràng, mặc định 15 phút.
- Lưu append-only dạng JSONL để có lịch sử có thể kiểm tra.
- Giới hạn số mẫu để tránh bộ nhớ tăng vô hạn.

## Safety

Coin/token chỉ được đưa vào luồng giao dịch khi dữ liệu an toàn cần thiết được xác nhận. Honeypot, sell blocked, thanh khoản không đạt, dữ liệu stale hoặc thông tin an toàn quan trọng chưa xác định đều không được coi là bằng chứng an toàn.

## Chạy

Cài Node.js 20 hoặc mới hơn:

```bash
npm install
npm start
```

Mặc định bot chạy PAPER mode.

## Kiểm tra

```bash
node Src/StatisticalJournal.test.js
node Src/StatisticalEdgeEngine.test.js
node Src/TradeDecisionGate.test.js
npm test
```

CI cũng kiểm tra syntax, safety, flow, on-chain adapters, discovery, statistical journal, statistical edge, decision gate, dashboard và Paper Bot smoke test.

## Dashboard

Dashboard Paper hiển thị equity, cash, position, trades, market data và activity. Trạng thái real-money execution luôn bị khóa trong phiên bản này.

## Dữ liệu thống kê

Mặc định journal được ghi vào:

```text
data/statistical-journal.jsonl
```

File này là dữ liệu quan sát của bot, không phải dữ liệu giả để làm đẹp kết quả.

## Quan trọng trước khi có live trading

Không chuyển sang tiền thật chỉ vì Paper Bot có một giai đoạn kết quả tốt. Cần đủ dữ liệu, kiểm tra out-of-sample/walk-forward, đánh giá drawdown, chi phí thực tế, độ ổn định theo nhiều thị trường và các cơ chế kill-switch/risk-control trước khi nghiên cứu execution thật.
