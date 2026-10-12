import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { ReviewsService } from '../modules/reviews/reviews.service.js';

/**
 * Script chạy thủ công Rating Backfill (Idempotent)
 *
 * Mục đích:
 * - Khởi tạo và đồng bộ rating (averageRating, reviewCount) cho toàn bộ Property và RentalUnit hiện có.
 * - Idempotent: Có thể chạy lại an toàn nhiều lần mà không làm sai lệch dữ liệu.
 *
 * Thời điểm chạy:
 * - Chạy THỦ CÔNG MỘT LẦN duy nhất khi triển khai Migration 3 (sau khi deploy code và khởi tạo schema mới).
 * - Hoặc chạy lại khi cần sửa chữa rating trên diện rộng sau sự cố dữ liệu.
 * - KHÔNG tự động thực thi khi ứng dụng khởi động để tránh làm chậm startup time và nghẽn tài nguyên DB.
 *
 * Lưu ý về Concurrency:
 * - Nên chạy vào khung giờ thấp điểm (off-peak hours) hoặc thời gian bảo trì để giảm thiểu
 *   tình trạng ghi đồng thời (concurrent review writes).
 * - Nếu có review được tạo/sửa/xóa đồng thời giữa thời điểm tính aggregate và $set, rating có thể tạm thời
 *   lệch nhẹ, nhưng cơ chế Cron Job Daily Reconciliation lúc 00:00 (hoặc chạy lại script này) sẽ tự động đối soát và chuẩn hóa lại.
 *
 * Hướng dẫn lệnh chạy:
 * - Bước 1: Build source code
 *     npm run build
 * - Bước 2: Chạy script backfill
 *     npm run backfill:ratings
 *   (hoặc trực tiếp: node dist/scripts/backfill-ratings.js)
 */
async function runBackfill() {
  console.log('====================================================');
  console.log('🚀 Bắt đầu chạy thủ công Rating Backfill cho Roomie');
  console.log('====================================================');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const reviewsService = app.get(ReviewsService);
    console.log('Đang thực hiện tính toán và cập nhật ratings theo từng batch (batchSize = 50)...');

    const startTime = Date.now();
    const result = await reviewsService.backfillAllRatings(50);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('----------------------------------------------------');
    console.log(`✅ Hoàn tất Rating Backfill thành công trong ${duration}s!`);
    console.log(`- Số nhà trọ (Properties) đã cập nhật: ${result.propertiesUpdated}`);
    console.log(`- Số phòng trọ (RentalUnits) đã cập nhật: ${result.unitsUpdated}`);
    console.log('====================================================');
  } catch (error) {
    console.error('❌ Lỗi xảy ra trong quá trình Rating Backfill:', error);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

runBackfill();
