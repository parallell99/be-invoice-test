-- 004: ล้างข้อมูลทุกแถวในตาราง users
-- invoices.created_by อ้าง users — ON DELETE SET NULL จึงไม่บล็อกการลบ

DELETE FROM users;
