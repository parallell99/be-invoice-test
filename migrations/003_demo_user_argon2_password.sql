-- 003: อัปเดตรหัส demo_user เป็น Argon2id (รหัสยังเป็น secret12 เหมือนเดิม)
-- ใช้เมื่อ DB เคยรัน 002 แบบ bcrypt แล้ว — รันซ้ำได้ (idempotent ต่อแถวเดียวกัน)

UPDATE users
SET password_hash = '$argon2id$v=19$m=65536,t=3,p=4$kE88nW2M6qwcnbzAzG/MCA$yPRrSP7cjHmV9RLVknEz4jn4Gg9M6PEe1+fF5UDv+is'
WHERE user_name = 'demo_user';
