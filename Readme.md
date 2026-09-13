# DEX Bot Free / Paper Trading

Bot Node.js miễn phí dùng để theo dõi giá và mô phỏng giao dịch.

## ⚠️ SAFETY

Đây là PAPER TRADING ONLY.

Bot hiện tại:

- Không có private key
- Không kết nối ví để ký giao dịch
- Không gửi transaction lên blockchain
- Không giao dịch tiền thật
- Không chuyển tiền
- Không rút tiền
- Không lưu seed phrase

## Chức năng

Bot có thể:

1. Lấy giá BTC/USD.
2. Theo dõi biến động giá.
3. Tạo tín hiệu BUY/SELL/HOLD.
4. Mô phỏng giao dịch.
5. Tính giá trị portfolio giả lập.
6. Chạy liên tục bằng Node.js.
7. Ghi trạng thái ra console.

## Cấu hình

Copy:

.env.example

thành:

.env

Ví dụ:

BOT_MODE=paper
POLL_SECONDS=60
START_BALANCE_USD=1000
ASSET=BTC
BUY_DROP_PCT=2
SELL_RISE_PCT=3

## Chạy

Cài Node.js 20 hoặc mới hơn.

Sau đó:

npm start

## Kiểm tra

Bot sẽ hiển thị dạng:

BTC | $xxxxx.xx | HOLD | Paper equity: $1000.00

Nếu đủ điều kiện:

PAPER BUY BTC at $xxxxx.xx

Sau đó khi đạt điều kiện bán:

PAPER SELL BTC at $xxxxx.xx

## GitHub

Không commit:

.env
node_modules/

Private keys tuyệt đối không đưa vào GitHub.

## Giai đoạn tiếp theo

Sau khi PAPER BOT chạy ổn định:

1. Thêm Telegram notification.
2. Thêm nhiều coin.
3. Thêm database/log persistence.
4. Thêm health check.
5. Thêm automatic restart.
6. Deploy lên free-tier.
7. Chạy demo 24/7.
8. Chỉ sau khi kiểm thử đầy đủ mới nghiên cứu live DEX execution.
